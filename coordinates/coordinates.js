(function initCadastreModule(global) {
  "use strict";

  const CADASTRAL_NUMBER_PATTERN = /^\d{1,2}:\d{1,2}:\d{1,10}:\d+$/;
  const WEB_MERCATOR_LIMIT = 20037508.342789244;
  const WEB_MERCATOR_LATITUDE_LIMIT = 85.05112878;
  const MAP_PREFERENCE_KEY = "archeoplan:cadastre-base-map";
  const COLORS = ["#ff6a21", "#246bfe", "#7ee2b8", "#ffc857", "#b58cff", "#ff7968"];

  const FRIENDLY_LABELS = {
    "geometry.type": "Тип геометрии",
    "geometry.points": "Количество поворотных точек",
    "id": "Идентификатор объекта",
    "cadastralDistrictsCode": "Код кадастрового округа",
    "category": "Код категории",
    "categoryName": "Категория",
    "descr": "Описание",
    "externalKey": "Внешний ключ",
    "interactionId": "Идентификатор взаимодействия",
    "label": "Подпись",
    "options.area": "Площадь",
    "options.cad_num": "Кадастровый номер",
    "options.cost_application_date": "Дата применения кадастровой стоимости",
    "options.cost_approvement_date": "Дата утверждения кадастровой стоимости",
    "options.cost_determination_date": "Дата определения кадастровой стоимости",
    "options.cost_index": "Удельный показатель кадастровой стоимости",
    "options.cost_registration_date": "Дата внесения кадастровой стоимости",
    "options.cost_value": "Кадастровая стоимость",
    "options.declared_area": "Декларированная площадь",
    "options.determination_couse": "Основание определения стоимости",
    "options.land_record_category_type": "Категория земель",
    "options.land_record_reg_date": "Дата постановки на учёт",
    "options.land_record_subtype": "Подтип объекта",
    "options.land_record_type": "Тип объекта",
    "options.ownership_type": "Форма собственности",
    "options.permitted_use_established_by_document": "Разрешённое использование",
    "options.quarter_cad_number": "Кадастровый квартал",
    "options.readable_address": "Адрес",
    "options.specified_area": "Уточнённая площадь",
    "options.status": "Статус",
    "subcategory": "Подкатегория",
    "systemInfo.inserted": "Добавлено в источник",
    "systemInfo.insertedBy": "Кем добавлено",
    "systemInfo.updated": "Обновлено в источнике",
    "systemInfo.updatedBy": "Кем обновлено",
  };

  function parseCadastralNumbers(value) {
    const tokens = String(value || "")
      .replace(/\u00a0/g, " ")
      .split(/[\s,;]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const numbers = [];
    const invalid = [];
    const seen = new Set();

    tokens.forEach((token) => {
      if (!CADASTRAL_NUMBER_PATTERN.test(token)) {
        invalid.push(token);
        return;
      }
      if (!seen.has(token)) {
        seen.add(token);
        numbers.push(token);
      }
    });

    return { numbers, invalid };
  }

  function mercatorToWgs84(x, y) {
    const longitude = (x / WEB_MERCATOR_LIMIT) * 180;
    let latitude = (y / WEB_MERCATOR_LIMIT) * 180;
    latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp((latitude * Math.PI) / 180)) - Math.PI / 2);
    return [longitude, latitude];
  }

  function toWgs84(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      throw new Error("Некорректная координата в геометрии участка.");
    }
    const first = Number(coordinate[0]);
    const second = Number(coordinate[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      throw new Error("Координата участка не является числом.");
    }

    // В образце API поле CRS содержит EPSG:3857, но сами значения уже переданы
    // как долгота/широта. Поэтому формат определяется по диапазону значений.
    if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
      return [first, second];
    }
    if (Math.abs(first) <= WEB_MERCATOR_LIMIT && Math.abs(second) <= WEB_MERCATOR_LIMIT) {
      return mercatorToWgs84(first, second);
    }
    throw new Error("Система координат участка не распознана.");
  }

  function transformGeometry(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) {
      throw new Error("API не вернул геометрию участка.");
    }

    if (geometry.type === "Polygon") {
      return {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring) => ring.map(toWgs84)),
      };
    }
    if (geometry.type === "MultiPolygon") {
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(toWgs84))),
      };
    }
    throw new Error(`Тип геометрии «${geometry.type || "неизвестен"}» не поддерживается.`);
  }

  function getCadastralNumber(feature) {
    const properties = feature && feature.properties ? feature.properties : {};
    const options = properties.options || {};
    return String(options.cad_num || properties.externalKey || properties.label || properties.descr || feature.id || "Без номера");
  }

  function coordinatesEqual(first, second) {
    return Boolean(
      first &&
      second &&
      Math.abs(first[0] - second[0]) < 1e-10 &&
      Math.abs(first[1] - second[1]) < 1e-10,
    );
  }

  function getGeometryRings(geometry) {
    if (geometry.type === "Polygon") {
      return geometry.coordinates.map((coordinates, ringIndex) => ({
        polygonIndex: 1,
        ringIndex: ringIndex + 1,
        coordinates,
      }));
    }
    return geometry.coordinates.flatMap((polygon, polygonIndex) =>
      polygon.map((coordinates, ringIndex) => ({
        polygonIndex: polygonIndex + 1,
        ringIndex: ringIndex + 1,
        coordinates,
      })),
    );
  }

  function extractVertices(feature) {
    const cadastralNumber = getCadastralNumber(feature);
    const rings = getGeometryRings(feature.geometry);
    return rings.flatMap((ring) => {
      const coordinates = ring.coordinates.slice();
      if (coordinates.length > 1 && coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])) {
        coordinates.pop();
      }
      const contour = feature.geometry.type === "MultiPolygon"
        ? `${ring.polygonIndex}.${ring.ringIndex}`
        : String(ring.ringIndex);
      return coordinates.map((coordinate, pointIndex) => ({
        cadastralNumber,
        contour,
        point: pointIndex + 1,
        longitude: coordinate[0],
        latitude: coordinate[1],
      }));
    });
  }

  function flattenObject(value, prefix = "", target = {}) {
    if (value === null || value === undefined) {
      if (prefix) target[prefix] = value;
      return target;
    }
    if (Array.isArray(value)) {
      target[prefix] = value.join(", ");
      return target;
    }
    if (typeof value !== "object") {
      target[prefix] = value;
      return target;
    }

    const entries = Object.entries(value);
    if (!entries.length && prefix) target[prefix] = "";
    entries.forEach(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenObject(child, path, target);
    });
    return target;
  }

  function normalizeApiResponse(payload) {
    if (!payload || payload.status !== "ok") {
      const apiError = Array.isArray(payload && payload.errors) ? payload.errors.filter(Boolean).join("; ") : "";
      throw new Error(apiError || "Кадастровый API вернул ошибку.");
    }
    const collection = payload.data;
    if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
      throw new Error("Ответ API не содержит коллекцию кадастровых участков.");
    }

    const rejected = [];
    const features = [];
    collection.features.forEach((feature) => {
      try {
        if (!feature || feature.type !== "Feature") throw new Error("Объект не является GeoJSON Feature.");
        features.push({
          ...feature,
          geometry: transformGeometry(feature.geometry),
          properties: feature.properties || {},
        });
      } catch (error) {
        rejected.push({
          cadastralNumber: getCadastralNumber(feature || {}),
          message: error.message,
        });
      }
    });
    return { features, rejected, errors: Array.isArray(payload.errors) ? payload.errors : [] };
  }

  function formatCoordinate(value, decimalComma = false) {
    const formatted = Number(value).toFixed(10);
    return decimalComma ? formatted.replace(".", ",") : formatted;
  }

  const Core = {
    parseCadastralNumbers,
    toWgs84,
    transformGeometry,
    getCadastralNumber,
    extractVertices,
    flattenObject,
    normalizeApiResponse,
    formatCoordinate,
  };

  global.ArcheoplanCadastreCore = Core;
  if (typeof document === "undefined") return;

  const config = {
    endpoint: "http://193.93.121.145/api/getCadastrCoord",
    maxCadastralNumbers: 50,
    requestTimeoutMs: 60000,
    map: {
      defaultBaseMap: "relief",
      initialCenter: [55.75, 37.62],
      initialZoom: 4,
      minZoom: 2,
      maxZoom: 20,
      baseMaps: [],
    },
    ...(global.ARCHEOPLAN_CADASTRE_CONFIG || {}),
  };

  const elements = {
    header: document.querySelector("[data-header]"),
    menuButton: document.querySelector(".menu-toggle"),
    mobileMenu: document.querySelector(".mobile-menu"),
    form: document.querySelector("#tool-form"),
    input: document.querySelector("#cadastre-input"),
    inputError: document.querySelector("#input-error"),
    numberCount: document.querySelector("[data-number-count]"),
    fillExample: document.querySelector("[data-fill-example]"),
    clearForm: document.querySelector("[data-clear-form]"),
    submitLabel: document.querySelector("[data-submit-label]"),
    submitButton: document.querySelector(".search-button"),
    requestStatus: document.querySelector("[data-request-status]"),
    results: document.querySelector("#results"),
    resultsNav: document.querySelectorAll("[data-results-nav]"),
    resultsCount: document.querySelector("[data-results-count]"),
    pointsCount: document.querySelector("[data-points-count]"),
    missingNotice: document.querySelector("[data-missing-notice]"),
    fitMap: document.querySelector("[data-fit-map]"),
    mapStyle: document.querySelector("[data-map-style]"),
    mapStyleDescription: document.querySelector("[data-map-style-description]"),
    mapLoadStatus: document.querySelector("[data-map-load-status]"),
    mapViewport: document.querySelector(".map-viewport"),
    parcelPanel: document.querySelector("[data-parcel-panel]"),
    parcelEmpty: document.querySelector("[data-parcel-empty]"),
    parcelContent: document.querySelector("[data-parcel-content]"),
    parcelNumber: document.querySelector("[data-parcel-number]"),
    parcelColor: document.querySelector("[data-parcel-color]"),
    parcelProperties: document.querySelector("[data-parcel-properties]"),
    tableBody: document.querySelector("[data-coordinates-body]"),
    parcelCopyActions: document.querySelector("[data-parcel-copy-actions]"),
    copyAll: document.querySelector("[data-copy-all]"),
    downloadXlsx: document.querySelector("[data-download-xlsx]"),
    copyStatus: document.querySelector("[data-copy-status]"),
    pointDialog: document.querySelector("#point-dialog"),
    pointDialogClose: document.querySelector("[data-point-dialog-close]"),
    pointTitle: document.querySelector("[data-point-title]"),
    pointLat: document.querySelector("[data-point-lat]"),
    pointLng: document.querySelector("[data-point-lng]"),
    copyPoint: document.querySelector("[data-copy-point]"),
    pointCopyStatus: document.querySelector("[data-point-copy-status]"),
  };

  const state = {
    map: null,
    mapLayers: null,
    baseMaps: new Map(),
    activeBaseMapId: null,
    overlayRenderer: null,
    resizeObserver: null,
    mapStatusTimer: null,
    featureLayers: [],
    pointLayers: [],
    openNearestPointHandler: null,
    features: [],
    rows: [],
    selectedPoint: null,
    requestController: null,
  };

  function pluralize(number, forms) {
    const value = Math.abs(number) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
    return forms[2];
  }

  function setTextStatus(element, message, type = "") {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
  }

  function updateInputCount() {
    const { numbers } = parseCadastralNumbers(elements.input.value);
    elements.numberCount.textContent = `${numbers.length} ${pluralize(numbers.length, ["номер", "номера", "номеров"])}`;
  }

  function setLoading(isLoading) {
    elements.submitButton.disabled = isLoading;
    elements.input.disabled = isLoading;
    elements.clearForm.disabled = isLoading;
    elements.submitLabel.textContent = isLoading ? "Получаем данные…" : "Получить данные участков";
  }

  function closeMenu() {
    if (!elements.menuButton || !elements.mobileMenu) return;
    elements.menuButton.setAttribute("aria-expanded", "false");
    elements.menuButton.setAttribute("aria-label", "Открыть меню");
    elements.mobileMenu.hidden = true;
  }

  function initHeader() {
    const updateHeader = () => elements.header?.classList.toggle("is-scrolled", global.scrollY > 24);
    global.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    elements.menuButton?.addEventListener("click", () => {
      const open = elements.menuButton.getAttribute("aria-expanded") !== "true";
      elements.menuButton.setAttribute("aria-expanded", String(open));
      elements.menuButton.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
      elements.mobileMenu.hidden = !open;
    });
    elements.mobileMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.querySelectorAll("[data-current-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initReveal() {
    const items = document.querySelectorAll("[data-reveal]");
    const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in global) || reducedMotion) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    items.forEach((item) => {
      if (item.getBoundingClientRect().top > global.innerHeight * .8) item.classList.add("reveal-pending");
      else item.classList.add("is-visible");
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        entry.target.classList.remove("reveal-pending");
        observer.unobserve(entry.target);
      });
    }, { threshold: .12 });
    items.forEach((item) => observer.observe(item));
  }

  function getMapConfig() {
    const mapConfig = config.map && typeof config.map === "object" ? config.map : {};
    return {
      defaultBaseMap: String(mapConfig.defaultBaseMap || ""),
      initialCenter: Array.isArray(mapConfig.initialCenter) && mapConfig.initialCenter.length >= 2
        ? mapConfig.initialCenter.map(Number)
        : [55.75, 37.62],
      initialZoom: Number.isFinite(Number(mapConfig.initialZoom)) ? Number(mapConfig.initialZoom) : 4,
      minZoom: Number.isFinite(Number(mapConfig.minZoom)) ? Number(mapConfig.minZoom) : 2,
      maxZoom: Number.isFinite(Number(mapConfig.maxZoom)) ? Number(mapConfig.maxZoom) : 20,
      baseMaps: Array.isArray(mapConfig.baseMaps) ? mapConfig.baseMaps : [],
    };
  }

  function getBaseMapDefinitions() {
    const seen = new Set();
    return getMapConfig().baseMaps.filter((definition) => {
      if (!definition || typeof definition !== "object") return false;
      const id = String(definition.id || "").trim();
      const url = String(definition.url || "").trim();
      if (!id || !url || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function setMapLoadStatus(message = "", type = "", autoHideMs = 0) {
    if (!elements.mapLoadStatus) return;
    global.clearTimeout(state.mapStatusTimer);
    state.mapStatusTimer = null;
    elements.mapLoadStatus.textContent = message;
    elements.mapLoadStatus.hidden = !message;
    elements.mapLoadStatus.classList.toggle("is-error", type === "error");
    elements.mapLoadStatus.classList.toggle("is-loading", type === "loading");
    if (message && autoHideMs > 0) {
      state.mapStatusTimer = global.setTimeout(() => setMapLoadStatus(), autoHideMs);
    }
  }

  function getStoredBaseMapId() {
    try {
      return global.localStorage?.getItem(MAP_PREFERENCE_KEY) || "";
    } catch {
      return "";
    }
  }

  function storeBaseMapId(id) {
    try {
      global.localStorage?.setItem(MAP_PREFERENCE_KEY, id);
    } catch {
      // Карта продолжает работать, даже если браузер запретил localStorage.
    }
  }

  function updateMapStyleDescription(id) {
    if (!elements.mapStyleDescription) return;
    const entry = state.baseMaps.get(id);
    elements.mapStyleDescription.textContent = entry?.definition.description || "";
  }

  function bringDataToFront() {
    state.featureLayers.forEach(({ layer }) => {
      layer.eachLayer((shape) => {
        if (typeof shape.bringToFront === "function") shape.bringToFront();
      });
    });
    state.pointLayers.forEach(({ marker }) => {
      if (typeof marker.bringToFront === "function") marker.bringToFront();
    });
  }

  function createBaseMapLayer(definition, mapConfig) {
    const compactViewport = global.matchMedia("(max-width: 820px)").matches;
    const layer = global.L.tileLayer(definition.url, {
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom,
      noWrap: true,
      bounds: [[-WEB_MERCATOR_LATITUDE_LIMIT, -180], [WEB_MERCATOR_LATITUDE_LIMIT, 180]],
      pane: "tilePane",
      zIndex: 100,
      keepBuffer: compactViewport ? 2 : 4,
      updateWhenIdle: compactViewport,
      updateWhenZooming: false,
      updateInterval: 160,
      detectRetina: false,
      ...(definition.options || {}),
    });

    layer.on("loading", () => {
      layer._archeoplanTileErrors = 0;
      if (state.activeBaseMapId === definition.id) {
        setMapLoadStatus(`Загружаем подложку «${definition.label || definition.id}»…`, "loading");
      }
    });
    layer.on("tileerror", () => {
      layer._archeoplanTileErrors = (layer._archeoplanTileErrors || 0) + 1;
      if (state.activeBaseMapId === definition.id) {
        setMapLoadStatus("Часть карты не загрузилась. Можно выбрать другую подложку.", "error");
      }
    });
    layer.on("load", () => {
      if (state.activeBaseMapId !== definition.id) return;
      if (layer._archeoplanTileErrors) {
        setMapLoadStatus("Часть карты не загрузилась. Можно выбрать другую подложку.", "error", 6500);
      } else {
        setMapLoadStatus();
      }
      bringDataToFront();
    });
    return layer;
  }

  function switchBaseMap(id, { persist = true } = {}) {
    if (!state.map || !state.baseMaps.has(id)) return false;
    const nextEntry = state.baseMaps.get(id);
    if (state.activeBaseMapId && state.activeBaseMapId !== id) {
      const previousEntry = state.baseMaps.get(state.activeBaseMapId);
      if (previousEntry && state.map.hasLayer(previousEntry.layer)) state.map.removeLayer(previousEntry.layer);
    }

    state.activeBaseMapId = id;
    if (!state.map.hasLayer(nextEntry.layer)) nextEntry.layer.addTo(state.map);
    if (typeof nextEntry.layer.bringToBack === "function") nextEntry.layer.bringToBack();
    if (elements.mapStyle) elements.mapStyle.value = id;
    updateMapStyleDescription(id);
    if (persist) storeBaseMapId(id);
    global.requestAnimationFrame(bringDataToFront);
    return true;
  }

  function populateBaseMapPicker(definitions) {
    if (!elements.mapStyle) return;
    elements.mapStyle.textContent = "";
    const fragment = document.createDocumentFragment();
    definitions.forEach((definition) => {
      const option = document.createElement("option");
      option.value = definition.id;
      option.textContent = definition.label || definition.id;
      fragment.append(option);
    });
    elements.mapStyle.append(fragment);
    elements.mapStyle.disabled = definitions.length < 2;
  }

  function initMap() {
    const mapNode = document.querySelector("#cadastre-map");
    if (!mapNode) return;
    if (!global.L) {
      mapNode.textContent = "Не удалось загрузить карту. Проверьте подключение к интернету и обновите страницу.";
      mapNode.classList.add("map-load-error");
      return;
    }

    const mapConfig = getMapConfig();
    const definitions = getBaseMapDefinitions();
    if (!definitions.length) {
      mapNode.textContent = "В конфигурации не указаны картографические подложки.";
      mapNode.classList.add("map-load-error");
      return;
    }

    const worldBounds = [[-WEB_MERCATOR_LATITUDE_LIMIT, -180], [WEB_MERCATOR_LATITUDE_LIMIT, 180]];
    state.map = global.L.map(mapNode, {
      zoomControl: false,
      preferCanvas: true,
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom,
      maxBounds: worldBounds,
      maxBoundsViscosity: 1,
      dragging: true,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      trackResize: true,
      inertia: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 70,
    }).setView(mapConfig.initialCenter, mapConfig.initialZoom);

    const overlayPane = state.map.createPane("cadastreOverlayPane");
    overlayPane.style.zIndex = "610";
    state.overlayRenderer = global.L.canvas({ pane: "cadastreOverlayPane", padding: .35 });

    global.L.control.zoom({
      position: "topleft",
      zoomInTitle: "Увеличить карту",
      zoomOutTitle: "Уменьшить карту",
    }).addTo(state.map);
    global.L.control.scale({ imperial: false, position: "bottomleft" }).addTo(state.map);

    state.baseMaps = new Map();
    definitions.forEach((definition) => {
      state.baseMaps.set(definition.id, {
        definition,
        layer: createBaseMapLayer(definition, mapConfig),
      });
    });
    populateBaseMapPicker(definitions);

    const storedId = getStoredBaseMapId();
    const initialId = state.baseMaps.has(storedId)
      ? storedId
      : (state.baseMaps.has(mapConfig.defaultBaseMap) ? mapConfig.defaultBaseMap : definitions[0].id);
    switchBaseMap(initialId, { persist: false });

    state.mapLayers = global.L.featureGroup().addTo(state.map);
    state.map.on("moveend zoomend", bringDataToFront);

    let resizeFrame = 0;
    const invalidateMapSize = () => {
      global.cancelAnimationFrame(resizeFrame);
      resizeFrame = global.requestAnimationFrame(() => state.map?.invalidateSize({ pan: false }));
    };
    if ("ResizeObserver" in global && elements.mapViewport) {
      state.resizeObserver = new global.ResizeObserver(invalidateMapSize);
      state.resizeObserver.observe(elements.mapViewport);
    } else {
      global.addEventListener("resize", invalidateMapSize, { passive: true });
    }
    state.map.whenReady(invalidateMapSize);
  }

  function createPointPopup(point) {
    const wrapper = document.createElement("div");
    wrapper.className = "map-point-popup";
    const title = document.createElement("strong");
    title.textContent = `${point.cadastralNumber} · точка ${point.point}`;
    const latitude = document.createElement("span");
    latitude.textContent = `Широта: ${formatCoordinate(point.latitude)}`;
    const longitude = document.createElement("span");
    longitude.textContent = `Долгота: ${formatCoordinate(point.longitude)}`;
    wrapper.append(title, latitude, longitude);
    return wrapper;
  }

  function selectParcel(selectedIndex) {
    state.featureLayers.forEach(({ layer, color }, index) => {
      layer.eachLayer((shape) => {
        if (typeof shape.setStyle === "function") {
          shape.setStyle({
            color,
            weight: index === selectedIndex ? 4 : 2,
            fillColor: color,
            fillOpacity: index === selectedIndex ? .3 : .17,
          });
          if (index === selectedIndex && typeof shape.bringToFront === "function") shape.bringToFront();
        }
      });
    });
    state.pointLayers.forEach(({ marker }) => {
      if (typeof marker.bringToFront === "function") marker.bringToFront();
    });
  }

  function formatPropertyValue(key, value) {
    if (value === null || value === undefined || value === "") return "Нет данных";
    if (key === "options.cost_value" && Number.isFinite(Number(value))) {
      return `${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
    }
    if ((key === "options.specified_area" || key === "options.area" || key === "options.declared_area") && Number.isFinite(Number(value))) {
      return `${Number(value).toLocaleString("ru-RU")} м²`;
    }
    if (typeof value === "boolean") return value ? "Да" : "Нет";
    return String(value).replace(/\s+/g, " ").trim() || "Нет данных";
  }

  function setParcelPanelState(showDetails) {
    elements.parcelPanel.dataset.state = showDetails ? "details" : "empty";
    elements.parcelEmpty.hidden = showDetails;
    elements.parcelEmpty.setAttribute("aria-hidden", String(showDetails));
    elements.parcelContent.hidden = !showDetails;
    elements.parcelContent.setAttribute("aria-hidden", String(!showDetails));
    if (showDetails) elements.parcelContent.scrollTop = 0;
  }

  function renderParcelDetails(feature, color, featureIndex) {
    selectParcel(featureIndex);
    setParcelPanelState(true);
    elements.parcelNumber.textContent = getCadastralNumber(feature);
    elements.parcelColor.style.backgroundColor = color;
    elements.parcelColor.style.boxShadow = `0 0 0 5px ${color}18`;
    elements.parcelProperties.textContent = "";

    const flattened = {
      "geometry.type": feature.geometry.type,
      "geometry.points": extractVertices(feature).length,
      id: feature.id,
      ...flattenObject(feature.properties),
    };
    const fragment = document.createDocumentFragment();
    Object.entries(flattened).forEach(([key, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = FRIENDLY_LABELS[key] || key.replaceAll("_", " ");
      description.textContent = formatPropertyValue(key, value);
      row.append(term, description);
      fragment.append(row);
    });
    elements.parcelProperties.append(fragment);
  }

  function openPointDialog(point) {
    state.selectedPoint = point;
    elements.pointTitle.textContent = `${point.cadastralNumber} · точка ${point.point}`;
    elements.pointLat.textContent = formatCoordinate(point.latitude);
    elements.pointLng.textContent = formatCoordinate(point.longitude);
    setTextStatus(elements.pointCopyStatus, "");
    if (typeof elements.pointDialog.showModal === "function") elements.pointDialog.showModal();
    else elements.pointDialog.setAttribute("open", "");
  }

  function closePointDialog() {
    if (typeof elements.pointDialog.close === "function") elements.pointDialog.close();
    else elements.pointDialog.removeAttribute("open");
  }

  function openNearestPoint(containerPoint, maximumDistance = 14) {
    if (!state.map || !containerPoint || !state.pointLayers.length) return false;
    let nearest = null;
    state.pointLayers.forEach(({ marker, point }) => {
      const markerPoint = state.map.latLngToContainerPoint(marker.getLatLng());
      const distance = markerPoint.distanceTo(containerPoint);
      if (!nearest || distance < nearest.distance) nearest = { marker, point, distance };
    });
    if (!nearest || nearest.distance > maximumDistance) return false;
    nearest.marker.openPopup();
    openPointDialog(nearest.point);
    return true;
  }

  function renderMap(features) {
    if (!state.map || !state.mapLayers) return;
    state.mapLayers.clearLayers();
    state.featureLayers = [];
    state.pointLayers = [];

    features.forEach((feature, featureIndex) => {
      const color = COLORS[featureIndex % COLORS.length];
      const cadastralNumber = getCadastralNumber(feature);
      const polygonLayer = global.L.geoJSON(feature, {
        pane: "cadastreOverlayPane",
        renderer: state.overlayRenderer,
        style: {
          color,
          weight: 2,
          opacity: 1,
          fillColor: color,
          fillOpacity: .17,
        },
      });
      polygonLayer.eachLayer((shape) => {
        shape.bindTooltip(cadastralNumber, { sticky: true, direction: "top" });
        shape.on("click", () => renderParcelDetails(feature, color, featureIndex));
      });
      polygonLayer.addTo(state.mapLayers);
      state.featureLayers.push({ layer: polygonLayer, color, feature });

      extractVertices(feature).forEach((point) => {
        const marker = global.L.circleMarker([point.latitude, point.longitude], {
          pane: "cadastreOverlayPane",
          renderer: state.overlayRenderer,
          radius: 5,
          color: "#f4f1e9",
          weight: 1.5,
          fillColor: color,
          fillOpacity: 1,
        });
        marker.bindTooltip(`Точка ${point.point}`, { direction: "top", offset: [0, -5] });
        marker.bindPopup(() => createPointPopup(point), { maxWidth: 280 });
        marker.on("click", () => {
          marker.openPopup();
          openPointDialog(point);
        });
        marker.addTo(state.mapLayers);
        state.pointLayers.push({ marker, point });
      });
    });

    bringDataToFront();
    if (state.openNearestPointHandler) state.map.off("click", state.openNearestPointHandler);
    state.openNearestPointHandler = (event) => openNearestPoint(event.containerPoint);
    state.map.on("click", state.openNearestPointHandler);
    const bounds = state.mapLayers.getBounds();
    if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [38, 38], maxZoom: 18 });
  }

  function renderTable(rows) {
    elements.tableBody.textContent = "";
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const values = [
        row.cadastralNumber,
        row.contour,
        row.point,
        formatCoordinate(row.latitude, true),
        formatCoordinate(row.longitude, true),
      ];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 2) cell.className = "point-index";
        tr.append(cell);
      });
      fragment.append(tr);
    });
    elements.tableBody.append(fragment);
  }

  function groupRowsByParcel(rows) {
    return rows.reduce((groups, row) => {
      if (!groups.has(row.cadastralNumber)) groups.set(row.cadastralNumber, []);
      groups.get(row.cadastralNumber).push(row);
      return groups;
    }, new Map());
  }

  function buildClipboardTable(rows) {
    const headers = ["Кадастровый номер", "Контур", "Точка", "Широта (X)", "Долгота (Y)"];
    const matrix = [
      headers,
      ...rows.map((row) => [
        row.cadastralNumber,
        row.contour,
        row.point,
        formatCoordinate(row.latitude, true),
        formatCoordinate(row.longitude, true),
      ]),
    ];
    const text = matrix.map((row) => row.join("\t")).join("\n");

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    const headRow = document.createElement("tr");
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.textContent = header;
      th.style.border = "1px solid #999";
      th.style.padding = "4px 7px";
      headRow.append(th);
    });
    const thead = document.createElement("thead");
    thead.append(headRow);
    table.append(thead);
    const tbody = document.createElement("tbody");
    matrix.slice(1).forEach((values) => {
      const tr = document.createElement("tr");
      values.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        td.style.border = "1px solid #999";
        td.style.padding = "4px 7px";
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(tbody);
    return { text, html: table.outerHTML };
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const successful = document.execCommand("copy");
    textarea.remove();
    if (!successful) throw new Error("Браузер не разрешил копирование.");
  }

  async function copyRows(rows, statusElement = elements.copyStatus) {
    if (!rows.length) {
      setTextStatus(statusElement, "Нет координат для копирования.", "error");
      return;
    }
    const content = buildClipboardTable(rows);
    try {
      if (global.navigator.clipboard && global.ClipboardItem && global.navigator.clipboard.write) {
        const item = new global.ClipboardItem({
          "text/plain": new Blob([content.text], { type: "text/plain" }),
          "text/html": new Blob([content.html], { type: "text/html" }),
        });
        await global.navigator.clipboard.write([item]);
      } else if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        await global.navigator.clipboard.writeText(content.text);
      } else {
        fallbackCopy(content.text);
      }
      setTextStatus(statusElement, `Скопировано: ${rows.length} ${pluralize(rows.length, ["точка", "точки", "точек"])}.`, "success");
    } catch (error) {
      try {
        fallbackCopy(content.text);
        setTextStatus(statusElement, `Скопировано: ${rows.length} ${pluralize(rows.length, ["точка", "точки", "точек"])}.`, "success");
      } catch {
        setTextStatus(statusElement, "Не удалось скопировать таблицу. Выделите строки вручную.", "error");
      }
    }
  }

  function renderParcelCopyActions(rows) {
    elements.parcelCopyActions.textContent = "";
    const fragment = document.createDocumentFragment();
    groupRowsByParcel(rows).forEach((parcelRows, cadastralNumber) => {
      const featureIndex = state.features.findIndex((feature) => getCadastralNumber(feature) === cadastralNumber);
      const color = COLORS[(featureIndex >= 0 ? featureIndex : 0) % COLORS.length];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "parcel-copy-button";
      button.style.setProperty("--button-color", color);
      button.textContent = `Копировать ${cadastralNumber}`;
      button.addEventListener("click", () => copyRows(parcelRows));
      fragment.append(button);
    });
    elements.parcelCopyActions.append(fragment);
  }

  function exportExcel() {
    if (!state.rows.length) {
      setTextStatus(elements.copyStatus, "Нет координат для выгрузки.", "error");
      return;
    }
    if (!global.XLSX) {
      setTextStatus(elements.copyStatus, "Модуль Excel не загрузился. Проверьте интернет и обновите страницу.", "error");
      return;
    }

    const coordinateMatrix = [
      ["Кадастровый номер", "Контур", "Точка", "Широта (X)", "Долгота (Y)", "Система координат"],
      ...state.rows.map((row) => [
        row.cadastralNumber,
        row.contour,
        row.point,
        row.latitude,
        row.longitude,
        "WGS 84 (EPSG:4326)",
      ]),
    ];
    const coordinatesSheet = global.XLSX.utils.aoa_to_sheet(coordinateMatrix);
    coordinatesSheet["!cols"] = [
      { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 23 },
    ];
    coordinatesSheet["!autofilter"] = { ref: `A1:F${coordinateMatrix.length}` };

    const flattenedFeatures = state.features.map((feature) => ({
      "Кадастровый номер": getCadastralNumber(feature),
      "Тип геометрии": feature.geometry.type,
      "Количество поворотных точек": extractVertices(feature).length,
      ...flattenObject(feature.properties),
    }));
    const propertyKeys = Array.from(new Set(flattenedFeatures.flatMap((row) => Object.keys(row))));
    const propertyMatrix = [
      propertyKeys,
      ...flattenedFeatures.map((row) => propertyKeys.map((key) => row[key] ?? "")),
    ];
    const propertiesSheet = global.XLSX.utils.aoa_to_sheet(propertyMatrix);
    propertiesSheet["!cols"] = propertyKeys.map((key, index) => ({ wch: index === 0 ? 24 : Math.min(Math.max(key.length + 2, 16), 42) }));
    propertiesSheet["!autofilter"] = { ref: `A1:${global.XLSX.utils.encode_col(propertyKeys.length - 1)}${propertyMatrix.length}` };

    const workbook = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(workbook, coordinatesSheet, "Поворотные точки");
    global.XLSX.utils.book_append_sheet(workbook, propertiesSheet, "Характеристики");
    workbook.Props = {
      Title: "Координаты поворотных точек кадастровых участков",
      Subject: "Археоплан — инструмент для археологического отчёта",
      Author: "Археоплан",
      CreatedDate: new Date(),
    };
    const date = new Date().toISOString().slice(0, 10);
    global.XLSX.writeFile(workbook, `Археоплан_поворотные_точки_${date}.xlsx`);
    setTextStatus(elements.copyStatus, "Excel-файл сформирован.", "success");
  }

  function renderMissingNotice(requestedNumbers, normalized) {
    const returnedNumbers = new Set(normalized.features.map(getCadastralNumber));
    const missing = requestedNumbers.filter((number) => !returnedNumbers.has(number));
    const messages = [];
    if (missing.length) messages.push(`Не найдены: ${missing.join(", ")}.`);
    if (normalized.rejected.length) {
      messages.push(`Не удалось построить: ${normalized.rejected.map((item) => `${item.cadastralNumber} (${item.message})`).join("; ")}.`);
    }
    const apiErrors = normalized.errors.filter(Boolean).map((error) => typeof error === "string" ? error : JSON.stringify(error));
    if (apiErrors.length) messages.push(`Сообщения API: ${apiErrors.join("; ")}.`);
    elements.missingNotice.textContent = messages.join(" ");
    elements.missingNotice.hidden = !messages.length;
  }

  function showResults(normalized, requestedNumbers) {
    state.features = normalized.features;
    state.rows = normalized.features.flatMap(extractVertices);
    elements.results.hidden = false;
    state.map?.invalidateSize({ pan: false });
    elements.resultsNav.forEach((link) => { link.hidden = false; });
    elements.resultsCount.textContent = `${state.features.length} ${pluralize(state.features.length, ["участок", "участка", "участков"])}`;
    elements.pointsCount.textContent = `${state.rows.length} ${pluralize(state.rows.length, ["поворотная точка", "поворотные точки", "поворотных точек"])}`;
    renderMissingNotice(requestedNumbers, normalized);
    renderMap(state.features);
    renderTable(state.rows);
    renderParcelCopyActions(state.rows);
    setParcelPanelState(false);
    setTextStatus(elements.copyStatus, "");
    global.requestAnimationFrame(() => {
      state.map?.invalidateSize({ pan: false });
      const bounds = state.mapLayers?.getBounds();
      if (bounds?.isValid()) state.map.fitBounds(bounds, { padding: [38, 38], maxZoom: 18 });
      bringDataToFront();
    });
    elements.results.scrollIntoView({ behavior: global.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function resetResults() {
    state.requestController?.abort();
    state.features = [];
    state.rows = [];
    state.mapLayers?.clearLayers();
    elements.results.hidden = true;
    elements.resultsNav.forEach((link) => { link.hidden = true; });
    setParcelPanelState(false);
    elements.missingNotice.hidden = true;
    setTextStatus(elements.copyStatus, "");
  }

  async function requestParcels(numbers) {
    state.requestController?.abort();
    const controller = new AbortController();
    state.requestController = controller;
    const timeout = global.setTimeout(() => controller.abort(), Number(config.requestTimeoutMs) || 60000);
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ cadastr_array: numbers }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Сервер вернул HTTP ${response.status}.`);
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error("Сервер вернул ответ не в формате JSON.");
      }
      return normalizeApiResponse(payload);
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Время ожидания ответа истекло. Попробуйте ещё раз.");
      if (error instanceof TypeError) {
        throw new Error("Не удалось подключиться к кадастровому API. Проверьте адрес сервиса, HTTPS и настройки CORS.");
      }
      throw error;
    } finally {
      global.clearTimeout(timeout);
      if (state.requestController === controller) state.requestController = null;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = parseCadastralNumbers(elements.input.value);
    elements.input.setAttribute("aria-invalid", "false");
    setTextStatus(elements.inputError, "");
    setTextStatus(elements.requestStatus, "");

    if (!parsed.numbers.length) {
      elements.input.setAttribute("aria-invalid", "true");
      setTextStatus(elements.inputError, "Введите хотя бы один кадастровый номер в формате 61:44:0050505:14.");
      elements.input.focus();
      return;
    }
    if (parsed.invalid.length) {
      elements.input.setAttribute("aria-invalid", "true");
      setTextStatus(elements.inputError, `Не удалось распознать: ${parsed.invalid.slice(0, 4).join(", ")}${parsed.invalid.length > 4 ? "…" : ""}`);
      elements.input.focus();
      return;
    }
    if (parsed.numbers.length > config.maxCadastralNumbers) {
      elements.input.setAttribute("aria-invalid", "true");
      setTextStatus(elements.inputError, `За один запрос можно проверить не более ${config.maxCadastralNumbers} кадастровых номеров.`);
      elements.input.focus();
      return;
    }

    setLoading(true);
    setTextStatus(elements.requestStatus, `Запрашиваем ${parsed.numbers.length} ${pluralize(parsed.numbers.length, ["участок", "участка", "участков"])}…`);
    try {
      const normalized = await requestParcels(parsed.numbers);
      if (!normalized.features.length) throw new Error("По указанным номерам участки с геометрией не найдены.");
      showResults(normalized, parsed.numbers);
      setTextStatus(elements.requestStatus, "Данные получены.", "success");
    } catch (error) {
      setTextStatus(elements.requestStatus, error.message || "Не удалось получить данные участков.", "error");
    } finally {
      setLoading(false);
    }
  }

  function bindEvents() {
    elements.input.addEventListener("input", () => {
      updateInputCount();
      if (elements.input.getAttribute("aria-invalid") === "true") {
        elements.input.setAttribute("aria-invalid", "false");
        setTextStatus(elements.inputError, "");
      }
    });
    elements.fillExample.addEventListener("click", () => {
      elements.input.value = "61:44:0050505:14\n61:44:0050504:64";
      updateInputCount();
      elements.input.focus();
    });
    elements.clearForm.addEventListener("click", () => {
      elements.input.value = "";
      updateInputCount();
      resetResults();
      setTextStatus(elements.requestStatus, "");
      setTextStatus(elements.inputError, "");
      elements.input.setAttribute("aria-invalid", "false");
      elements.input.focus();
    });
    elements.form.addEventListener("submit", handleSubmit);
    elements.mapStyle?.addEventListener("change", () => {
      switchBaseMap(elements.mapStyle.value);
    });
    elements.fitMap.addEventListener("click", () => {
      const bounds = state.mapLayers?.getBounds();
      if (bounds?.isValid()) state.map.fitBounds(bounds, { padding: [38, 38], maxZoom: 18 });
    });
    elements.copyAll.addEventListener("click", () => copyRows(state.rows));
    elements.downloadXlsx.addEventListener("click", exportExcel);
    elements.pointDialogClose.addEventListener("click", closePointDialog);
    elements.pointDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closePointDialog();
    });
    elements.pointDialog.addEventListener("click", (event) => {
      const rect = elements.pointDialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) closePointDialog();
    });
    elements.copyPoint.addEventListener("click", async () => {
      if (!state.selectedPoint) return;
      await copyRows([state.selectedPoint], elements.pointCopyStatus);
    });
  }

  function start() {
    initHeader();
    initReveal();
    initMap();
    bindEvents();
    updateInputCount();
  }

  start();
})(typeof window !== "undefined" ? window : globalThis);
