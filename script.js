const SITE_CONFIG = {
  mode: "live",
  formEndpoint: "https://script.google.com/macros/s/AKfycbySiPwONFP5r18xufYAJJsE2V4GNoXs2io_X8uVynAahqWbAwrQJFmfsso5qGFUbidrBQ/exec",
  privacyUrl: "",
  termsUrl: "",
  analyticsId: "",
};

(() => {
  "use strict";

  if (window.__ARCHEOPLAN_INITIALIZED__) return;
  window.__ARCHEOPLAN_INITIALIZED__ = true;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.querySelector("[data-header]");
  const menuButton = document.querySelector(".menu-toggle");
  const mobileMenu = document.querySelector(".mobile-menu");
  const dialog = document.querySelector("#interest-dialog");
  const form = document.querySelector("#interest-form");
  const closeButton = dialog?.querySelector("[data-dialog-close]");
  const status = form?.querySelector(".form-status");
  let lastFocusedElement = null;
  let scrollTicking = false;

  const track = (eventName) => {
    window.dispatchEvent(
      new CustomEvent("archeoplan:analytics", {
        detail: { event: eventName, analyticsId: SITE_CONFIG.analyticsId || null },
      }),
    );
  };

  const updateHeader = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 24);
    scrollTicking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollTicking) {
        window.requestAnimationFrame(updateHeader);
        scrollTicking = true;
      }
    },
    { passive: true },
  );
  updateHeader();

  const closeMenu = () => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Открыть меню");
    mobileMenu.hidden = true;
  };

  menuButton?.addEventListener("click", () => {
    const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(willOpen));
    menuButton.setAttribute("aria-label", willOpen ? "Закрыть меню" : "Открыть меню");
    if (mobileMenu) mobileMenu.hidden = !willOpen;
  });
  mobileMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

  const getFocusable = () =>
    dialog
      ? [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      : [];

  const openDialog = (source) => {
    if (!dialog) return;
    lastFocusedElement = source;
    closeMenu();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.classList.add("dialog-open");
    window.setTimeout(() => dialog.querySelector("input")?.focus(), 0);
    track("form_open");
  };

  const closeDialog = () => {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("dialog-open");
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  };

  document.querySelectorAll("[data-open-interest]").forEach((button) => {
    button.addEventListener("click", () => {
      track("cta_click");
      openDialog(button);
    });
  });
  document.querySelectorAll("[data-coordinate-tool]").forEach((link) => {
    link.addEventListener("click", () => track("coordinate_tool_click"));
  });
  closeButton?.addEventListener("click", closeDialog);
  dialog?.addEventListener("click", (event) => {
    const box = dialog.getBoundingClientRect();
    const outside =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom;
    if (outside) closeDialog();
  });
  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const setError = (input, message) => {
    if (!input) return;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    const error = document.querySelector(`#error-${input.name}`);
    if (error) error.textContent = message;
  };

  const validContact = (value) => {
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phone = /^[+\d][\d\s()\-]{7,}$/;
    return email.test(value) || phone.test(value);
  };

  const validateForm = () => {
    if (!form) return false;
    const fields = {
      name: form.elements.namedItem("name"),
      organization: form.elements.namedItem("organization"),
      contact: form.elements.namedItem("contact"),
      seats: form.elements.namedItem("seats"),
      intent: form.elements.namedItem("intent"),
    };
    let valid = true;

    setError(fields.name, fields.name.value.trim().length >= 2 ? "" : "Укажите имя.");
    // setError(fields.organization, fields.organization.value.trim().length >= 2 ? "" : "Укажите организацию.");
    setError(fields.contact, validContact(fields.contact.value.trim()) ? "" : "Введите телефон или корректный email.");
    const seats = Number(fields.seats.value);
    setError(fields.seats, Number.isInteger(seats) && seats >= 1 && seats <= 999 ? "" : "Укажите число от 1 до 999.");
    setError(fields.intent, fields.intent.checked ? "" : "Подтвердите готовность рассмотреть подключение.");

    Object.values(fields).forEach((field) => {
      if (field.getAttribute("aria-invalid") === "true") valid = false;
    });
    return valid;
  };

  form?.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.getAttribute("aria-invalid") === "true") {
      if (event.target.name === "contact") setError(event.target, validContact(event.target.value.trim()) ? "" : "Введите телефон или корректный email.");
      else if (event.target.name === "intent") setError(event.target, event.target.checked ? "" : "Подтвердите готовность рассмотреть подключение.");
      else setError(event.target, event.target.value.trim() ? "" : "Заполните поле.");
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (status) {
      status.textContent = "";
      status.classList.remove("is-success");
    }
    if (!validateForm()) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const liveMode =
      SITE_CONFIG.mode === "live"
      // &&
      // Boolean(SITE_CONFIG.formEndpoint) &&
      // Boolean(SITE_CONFIG.privacyUrl);

    if (!liveMode) {
      if (status) {
        status.textContent = "Форма работает в тестовом режиме. Данные не отправлены";
        status.classList.add("is-success");
      }
      track("form_submit_success");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const payload = new FormData(form);
      const response = await fetch(SITE_CONFIG.formEndpoint, {
        method: "POST",
        mode: "no-cors",
        body: payload,
      });
      if (!response.ok) throw new Error("Request failed");
      form.reset();
      if (status) {
        status.textContent = "Спасибо. Интерес зафиксирован.";
        status.classList.add("is-success");
      }
      track("form_submit_success");
    } catch {
      if (status) status.textContent = "Не удалось отправить заявку. Попробуйте ещё раз позже.";
    } finally {
      submitButton.disabled = false;
    }
  });

  const legalContainer = document.querySelector("[data-form-legal]");
  const footerLegal = document.querySelector(".legal-links");
  const legalItems = [
    ["Политика конфиденциальности", SITE_CONFIG.privacyUrl],
    ["Условия использования", SITE_CONFIG.termsUrl],
  ].filter((item) => item[1]);
  if (legalItems.length) {
    const links = legalItems.map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`).join(" · ");
    if (legalContainer) {
      legalContainer.innerHTML = `Отправляя форму, вы принимаете: ${links}`;
      legalContainer.hidden = false;
    }
    if (footerLegal) {
      footerLegal.innerHTML = links;
      footerLegal.hidden = false;
    }
  }

  const revealItems = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    revealItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.78) item.classList.add("reveal-pending");
      else item.classList.add("is-visible");
    });
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            entry.target.classList.remove("reveal-pending");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const storyLayout = document.querySelector(".story-layout");
  const storyLabel = document.querySelector("[data-story-label]");
  const labels = ["НЕРАЗОБРАННОЕ", "МЕТАДАННЫЕ ПРИВЯЗАНЫ", "СТРУКТУРА ГОТОВА"];
  if (storyLayout && "IntersectionObserver" in window && window.matchMedia("(min-width: 821px)").matches) {
    const storyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const state = entry.target.getAttribute("data-story-step") || "0";
          storyLayout.setAttribute("data-state", state);
          if (storyLabel) storyLabel.textContent = labels[Number(state)];
        });
      },
      { rootMargin: "-38% 0px -38% 0px", threshold: 0 },
    );
    document.querySelectorAll("[data-story-step]").forEach((trigger) => storyObserver.observe(trigger));
  } else if (storyLayout) {
    storyLayout.setAttribute("data-state", "2");
    if (storyLabel) storyLabel.textContent = labels[2];
  }

  const workflowScreens = [
    'блок 2 фото 1.jpg',
    'блок 2 выберите фото.jpg',
    'блок 2 укажите описание.jpg',
    'блок 2  снимите серию.jpg'
  ];
  const workflowSteps = [...document.querySelectorAll("[data-workflow-step]")];
  const phoneKicker = document.querySelector("[data-phone-kicker]");
  const phoneTitle = document.querySelector("[data-phone-title]");
  const phoneDescription = document.querySelector("[data-phone-description]");
  const phoneFields = document.querySelector("[data-phone-fields]");

  const setWorkflowStep = (index) => {
    const screen = workflowScreens[index];
    if (!screen) return;
    workflowSteps.forEach((step) => step.classList.toggle("is-active", Number(step.getAttribute("data-workflow-step")) === index));
    if (phoneKicker) phoneKicker.textContent = screen.kicker;
    if (phoneTitle) phoneTitle.textContent = screen.title;
    if (phoneDescription) phoneDescription.textContent = screen.description;
    if (phoneFields) {
      phoneFields.innerHTML = `<img src="assets/images/${screen}" style="width: 100%;border-bottom-left-radius: 34px; border-bottom-right-radius: 34px;">`;
    }
  };

  workflowSteps.forEach((step) => {
    step.querySelector(".step-select")?.addEventListener("click", () => {
      setWorkflowStep(Number(step.getAttribute("data-workflow-step")));
    });
  });

  if ("IntersectionObserver" in window && !reducedMotion.matches && window.matchMedia("(min-width: 821px)").matches) {
    const workflowObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setWorkflowStep(Number(entry.target.getAttribute("data-workflow-step")));
        });
      },
      { rootMargin: "-36% 0px -36% 0px", threshold: 0.2 },
    );
    workflowSteps.forEach((step) => workflowObserver.observe(step));
  }

  const albumSection = document.querySelector("[data-album-transform]");
  if (albumSection && "IntersectionObserver" in window) {
    const albumObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-active");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );
    albumObserver.observe(albumSection);
  } else {
    albumSection?.classList.add("is-active");
  }

  const faqItems = [...document.querySelectorAll(".faq-list details")];
  faqItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      faqItems.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });

  const parallaxCards = document.querySelectorAll("[data-parallax-card]");
  if (parallaxCards.length && !reducedMotion.matches) {
    parallaxCards.forEach((parallaxCard) => {
      const tilt = Number(parallaxCard.dataset.parallaxTilt) || 5;
      parallaxCard.addEventListener("pointermove", (event) => {
        const rect = parallaxCard.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        parallaxCard.style.setProperty("--ry", `${x * tilt}deg`);
        parallaxCard.style.setProperty("--rx", `${y * -tilt}deg`);
      });
      parallaxCard.addEventListener("pointerleave", () => {
        parallaxCard.style.setProperty("--ry", "0deg");
        parallaxCard.style.setProperty("--rx", "0deg");
      });
    });
  }

  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton?.getAttribute("aria-expanded") === "true") closeMenu();
  });
})();
