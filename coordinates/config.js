(() => {
  "use strict";

  const localHostnames = new Set(["", "localhost", "127.0.0.1"]);

  window.ARCHEOPLAN_CADASTRE_CONFIG = {
    // На опубликованном сайте запрос идёт через тот же домен.
    // Для локальной разработки используется адрес из переданного API-метода.
    endpoint: localHostnames.has(window.location.hostname)
      ? "http://193.93.121.145/api/getCadastrCoord"
      : "/api/getCadastrCoord",
    maxCadastralNumbers: 50,
    requestTimeoutMs: 60000,
    map: {
      defaultBaseMap: "relief",
      initialCenter: [55.75, 37.62],
      initialZoom: 4,
      minZoom: 2,
      maxZoom: 20,
      baseMaps: [
        {
          id: "relief",
          label: "Рельеф без границ",
          description: "Спокойная рельефная подложка без подписей и административных границ.",
          url: "https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/{z}/{y}/{x}.jpg",
          options: {
            maxNativeZoom: 18,
            attribution: 'Рельеф: данные &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> и <a href="https://maps.eox.at/#data" target="_blank" rel="noopener">другие источники</a>, рендеринг &copy; <a href="https://eox.at/" target="_blank" rel="noopener">EOX</a>',
          },
        },
        {
          id: "topographic",
          label: "Топографическая",
          description: "Горизонтали, высоты, дороги и ориентиры OpenTopoMap.",
          url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          options: {
            subdomains: "abc",
            maxNativeZoom: 17,
            attribution: 'Данные &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM · карта &copy; <a href="https://opentopomap.org/" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
          },
        },
        {
          id: "osm",
          label: "OpenStreetMap",
          description: "Подробная схема с дорогами, объектами и названиями.",
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          options: {
            maxNativeZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
          },
        },
        {
          id: "satellite",
          label: "Спутник Sentinel-2",
          description: "Безоблачная спутниковая мозаика 2017 года с глобальным покрытием.",
          url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2017_3857/default/g/{z}/{y}/{x}.jpg",
          options: {
            maxNativeZoom: 18,
            attribution: '<a href="https://s2maps.eu/" target="_blank" rel="noopener">Sentinel-2 cloudless</a> &copy; <a href="https://eox.at/" target="_blank" rel="noopener">EOX</a> · modified Copernicus Sentinel data 2017 · CC BY 4.0',
          },
        },
      ],
    },
  };
})();
