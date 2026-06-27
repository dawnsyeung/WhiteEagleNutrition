(() => {
  const cartStorageKey = 'wenCart';
  let cart = [];

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const petApp = {
    href: 'pet-photos-app.html',
    label: 'Happy Pets'
  };
  const nelliesGardenPage = {
    href: 'nellies-garden.html',
    label: "Nellie's Garden"
  };

  const navToggle = qs('.nav-toggle');
  const nav = qs('.site-nav');
  const cartToggle = qs('.cart-toggle');
  const cartPanel = qs('[data-cart-panel]');
  const cartClose = qs('.cart-close');
  const cartItemsContainer = qs('[data-cart-items]');
  const cartCount = qs('[data-cart-count]');
  const cartTotal = qs('[data-cart-total]');
  const checkoutBtn = qs('[data-checkout]');
  const hasShopifyBuyButton = Boolean(qs('[data-shopify-buy-button]'));
  const uiState = {
    navOpen: false,
    cartOpen: false,
    modalOpen: false
  };
  const metaCapiEndpoint = '/api/meta-capi';

  const createMetaEventId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const ensureMetaEventId = (eventName) => {
    if (!eventName) return '';
    window.__wenMetaEventIds = window.__wenMetaEventIds || {};
    if (!window.__wenMetaEventIds[eventName]) {
      window.__wenMetaEventIds[eventName] = createMetaEventId();
    }
    return window.__wenMetaEventIds[eventName];
  };

  const readCookie = (name) => {
    if (!name || !document.cookie) return '';
    const encodedName = `${encodeURIComponent(name)}=`;
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const cookie = part.trim();
      if (!cookie.startsWith(encodedName)) continue;
      return decodeURIComponent(cookie.slice(encodedName.length));
    }
    return '';
  };

  const sendPageViewToMetaCapi = () => {
    if (window.__wenMetaCapiPageViewSent) return;
    window.__wenMetaCapiPageViewSent = true;

    const eventId = ensureMetaEventId('PageView');
    if (!eventId) return;

    const payload = {
      event_name: 'PageView',
      event_id: eventId,
      event_source_url: window.location.href,
      fbp: readCookie('_fbp'),
      fbc: readCookie('_fbc')
    };

    fetch(metaCapiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  };

  const syncPageScrollLock = () => {
    const shouldLock = uiState.navOpen || uiState.cartOpen || uiState.modalOpen;
    document.body.style.overflow = shouldLock ? 'hidden' : '';
  };

  const setNavOpen = (isOpen) => {
    uiState.navOpen = Boolean(isOpen);
    if (nav && navToggle) {
      nav.classList.toggle('is-open', uiState.navOpen);
      navToggle.setAttribute('aria-expanded', String(uiState.navOpen));
    }
    syncPageScrollLock();
  };

  const setCartOpen = (isOpen) => {
    uiState.cartOpen = Boolean(isOpen);
    if (cartPanel) {
      cartPanel.classList.toggle('is-open', uiState.cartOpen);
      cartPanel.setAttribute('aria-hidden', String(!uiState.cartOpen));
    }
    syncPageScrollLock();
  };

  const setModalOpen = (isOpen) => {
    uiState.modalOpen = Boolean(isOpen);
    syncPageScrollLock();
  };

  const getProductContainerFromButton = (button) =>
    button.closest('[data-product-card]') ||
    button.closest('.product-card') ||
    button.closest('.product-tile') ||
    button.closest('article');

  const getProductTitleFromContainer = (productContainer) => {
    const productTitle = productContainer?.querySelector('h3');
    return (productTitle?.textContent || '').trim();
  };

  const isComingSoonProduct = (productContainer) => /\(coming soon\)/i.test(getProductTitleFromContainer(productContainer));

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const loadCart = () => {
    try {
      const stored = localStorage.getItem(cartStorageKey);
      cart = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Unable to parse cart data', error);
      cart = [];
    }
  };

  const saveCart = () => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  };

  const renderCart = () => {
    if (!cartItemsContainer) return;
    cartItemsContainer.innerHTML = '';

    if (!cart.length) {
      const empty = document.createElement('p');
      empty.className = 'cart-empty';
      empty.textContent = 'Your cart is currently empty. Explore our formulations tailored to every companion animal.';
      cartItemsContainer.appendChild(empty);
    } else {
      cart.forEach((item, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'cart-item';

        const meta = document.createElement('div');
        meta.className = 'cart-item__meta';
        const title = document.createElement('strong');
        title.textContent = item.name;
        const qty = document.createElement('span');
        qty.textContent = `Qty: ${item.quantity}`;
        const price = document.createElement('span');
        price.textContent = formatCurrency(item.price * item.quantity);
        meta.append(title, qty, price);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'cart-remove';
        removeBtn.type = 'button';
        removeBtn.setAttribute('aria-label', `Remove ${item.name} from cart`);
        removeBtn.innerHTML = '×';
        removeBtn.addEventListener('click', () => {
          cart.splice(index, 1);
          saveCart();
          renderCart();
          updateCartSummary();
        });

        wrapper.append(meta, removeBtn);
        cartItemsContainer.appendChild(wrapper);
      });
    }
  };

  const updateCartSummary = () => {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);

    if (cartCount) cartCount.textContent = totalItems;
    if (cartTotal) cartTotal.textContent = formatCurrency(totalPrice);
  };

  const addToCart = (product) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ ...product, quantity: 1 });
    }
    saveCart();
    renderCart();
    updateCartSummary();
    openCart();
  };

  const openCart = () => {
    if (!cartPanel) return;
    setNavOpen(false);
    setCartOpen(true);
  };

  const closeCart = () => {
    setCartOpen(false);
  };

  const toggleButtonLoading = (button, isLoading) => {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent;
      }
      const loadingLabel = button.getAttribute('data-loading-text') || 'Sending...';
      button.textContent = loadingLabel;
      button.disabled = true;
    } else {
      const originalLabel = button.dataset.originalLabel;
      if (originalLabel) {
        button.textContent = originalLabel;
      }
      button.disabled = false;
    }
  };

  const defaultFormspreeEndpoint = 'https://formspree.io/f/xqarlbqr';

  const createThankYouModal = () => {
    const existing = qs('[data-thank-you-modal]');
    if (existing) return existing;

    const overlay = document.createElement('div');
    overlay.className = 'wen-modal-overlay';
    overlay.setAttribute('data-thank-you-modal', '');
    overlay.setAttribute('aria-hidden', 'true');

    const modal = document.createElement('div');
    modal.className = 'wen-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'wen-modal-title');
    modal.setAttribute('aria-describedby', 'wen-modal-message');

    const header = document.createElement('div');
    header.className = 'wen-modal__header';

    const title = document.createElement('h2');
    title.className = 'wen-modal__title';
    title.id = 'wen-modal-title';
    title.textContent = 'Thank you!';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'wen-modal__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '×';

    header.append(title, closeBtn);

    const body = document.createElement('div');
    body.className = 'wen-modal__body';

    const message = document.createElement('p');
    message.className = 'wen-modal__message';
    message.id = 'wen-modal-message';
    message.textContent = 'You’re all set.';

    body.appendChild(message);

    modal.append(header, body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => closeThankYouModal();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    return overlay;
  };

  let thankYouModalLastFocus = null;

  const openThankYouModal = ({ title, message } = {}) => {
    const overlay = createThankYouModal();
    const modalTitle = qs('#wen-modal-title', overlay);
    const modalMessage = qs('#wen-modal-message', overlay);
    const closeBtn = qs('.wen-modal__close', overlay);

    if (modalTitle && title) modalTitle.textContent = title;
    if (modalMessage && message) modalMessage.textContent = message;

    thankYouModalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    setModalOpen(true);

    window.requestAnimationFrame(() => {
      closeBtn?.focus();
    });
  };

  const closeThankYouModal = () => {
    const overlay = qs('[data-thank-you-modal]');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    setModalOpen(false);

    if (thankYouModalLastFocus) {
      thankYouModalLastFocus.focus();
      thankYouModalLastFocus = null;
    }
  };

  let notifyModalLastFocus = null;

  const createNotifyModal = () => {
    const existing = qs('[data-notify-modal]');
    if (existing) return existing;

    const overlay = document.createElement('div');
    overlay.className = 'wen-modal-overlay';
    overlay.setAttribute('data-notify-modal', '');
    overlay.setAttribute('aria-hidden', 'true');

    const modal = document.createElement('div');
    modal.className = 'wen-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'wen-notify-title');

    const header = document.createElement('div');
    header.className = 'wen-modal__header';

    const title = document.createElement('h2');
    title.className = 'wen-modal__title';
    title.id = 'wen-notify-title';
    title.textContent = 'Get notified when available';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'wen-modal__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '×';

    header.append(title, closeBtn);

    const body = document.createElement('div');
    body.className = 'wen-modal__body';

    const message = document.createElement('p');
    message.className = 'wen-modal__message';
    message.innerHTML = 'Tell us where to reach you for <strong data-notify-product-name>this product</strong>.';

    const form = document.createElement('form');
    form.className = 'wen-notify-form';
    form.setAttribute('data-notify-form', '');
    form.setAttribute('data-endpoint', defaultFormspreeEndpoint);

    const nameRow = document.createElement('div');
    nameRow.className = 'wen-notify-form__row';
    const nameLabel = document.createElement('label');
    nameLabel.setAttribute('for', 'notify-name');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.name = 'name';
    nameInput.id = 'notify-name';
    nameInput.required = true;
    nameInput.autocomplete = 'name';
    nameInput.placeholder = 'Your name';
    nameRow.append(nameLabel, nameInput);

    const emailRow = document.createElement('div');
    emailRow.className = 'wen-notify-form__row';
    const emailLabel = document.createElement('label');
    emailLabel.setAttribute('for', 'notify-email');
    emailLabel.textContent = 'Email address';
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.name = 'email';
    emailInput.id = 'notify-email';
    emailInput.required = true;
    emailInput.autocomplete = 'email';
    emailInput.placeholder = 'you@example.com';
    emailRow.append(emailLabel, emailInput);

    const productInput = document.createElement('input');
    productInput.type = 'hidden';
    productInput.name = 'productName';
    productInput.setAttribute('data-notify-product-input', '');

    const status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('data-notify-status', '');
    status.hidden = true;

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary';
    submitBtn.setAttribute('data-loading-text', 'Sending...');
    submitBtn.textContent = 'Notify Me';

    form.append(nameRow, emailRow, productInput, status, submitBtn);
    body.append(message, form);
    modal.append(header, body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => closeNotifyModal();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    const setStatus = (type, text) => {
      status.classList.remove('form-status--success', 'form-status--error');
      if (!text) {
        status.hidden = true;
        status.textContent = '';
        return;
      }

      status.hidden = false;
      status.textContent = text;
      if (type === 'success') status.classList.add('form-status--success');
      if (type === 'error') status.classList.add('form-status--error');
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const endpoint = (form.getAttribute('data-endpoint') || '').trim() || defaultFormspreeEndpoint;
      if (!endpoint || endpoint.includes('YOUR_FORM_ID')) {
        setStatus('error', 'Notify submissions are not configured yet. Please email info@whiteeaglenutrition.com.');
        return;
      }

      setStatus('', '');
      toggleButtonLoading(submitBtn, true);

      const selectedProduct = productInput.value || 'a coming soon product';
      const formData = new FormData(form);
      formData.append('formName', 'notify-me');
      formData.append('_subject', `Notify me request: ${selectedProduct}`);
      formData.append('source', window.location.href);
      formData.append('submittedAt', new Date().toISOString());

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json'
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        form.reset();
        closeNotifyModal();
        openThankYouModal({
          title: 'You’re on the list',
          message: `Thanks! We’ll email you when ${selectedProduct} is available.`
        });
      } catch (error) {
        console.error('Notify-me submission failed', error);
        setStatus('error', 'Could not submit right now. Please try again in a moment.');
      } finally {
        toggleButtonLoading(submitBtn, false);
      }
    });

    return overlay;
  };

  const openNotifyModal = (productName) => {
    const overlay = createNotifyModal();
    const productField = qs('[data-notify-product-input]', overlay);
    const productLabel = qs('[data-notify-product-name]', overlay);
    const firstInput = qs('#notify-name', overlay);
    const status = qs('[data-notify-status]', overlay);

    if (status) {
      status.hidden = true;
      status.textContent = '';
      status.classList.remove('form-status--success', 'form-status--error');
    }

    if (productField) {
      productField.value = productName || 'this product';
    }
    if (productLabel) {
      productLabel.textContent = productName || 'this product';
    }

    notifyModalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    setModalOpen(true);

    window.requestAnimationFrame(() => {
      firstInput?.focus();
    });
  };

  const closeNotifyModal = () => {
    const overlay = qs('[data-notify-modal]');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    setModalOpen(false);

    if (notifyModalLastFocus) {
      notifyModalLastFocus.focus();
      notifyModalLastFocus = null;
    }
  };

  const setupNotifyMeButtons = () => {
    const buttons = qsa('[data-notify-me="true"]');
    if (!buttons.length) return;

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const productContainer = getProductContainerFromButton(button);
        const productName = getProductTitleFromContainer(productContainer).replace(/\s*\(coming soon\)\s*$/i, '');
        openNotifyModal(productName || 'this product');
      });
    });
  };

  const setupThankYouModalGlobalEvents = () => {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const thankYouOverlay = qs('[data-thank-you-modal]');
        const notifyOverlay = qs('[data-notify-modal]');
        if (thankYouOverlay?.classList.contains('is-open')) {
          closeThankYouModal();
          return;
        }
        if (notifyOverlay?.classList.contains('is-open')) {
          closeNotifyModal();
        }
      }
    });
  };

  const setupNavigation = () => {
    if (!navToggle || !nav) return;

    const isMobileNavViewport = () => window.matchMedia('(max-width: 1024px)').matches;

    setNavOpen(false);

    navToggle.addEventListener('click', () => {
      const isOpen = !uiState.navOpen;
      if (isOpen) {
        closeCart();
      }
      setNavOpen(isOpen);
    });

    qsa('.site-nav a').forEach((link) =>
      link.addEventListener('click', () => {
        setNavOpen(false);
      })
    );

    nav.addEventListener('click', (event) => {
      if (event.target === nav) {
        setNavOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setNavOpen(false);
      }
    });

    document.addEventListener('click', (event) => {
      if (!isMobileNavViewport() || !uiState.navOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (nav.contains(target) || navToggle.contains(target)) return;
      setNavOpen(false);
    });

    window.addEventListener('resize', () => {
      if (!isMobileNavViewport()) {
        setNavOpen(false);
      }
    });
  };

  const setupPurchaseNavCta = () => {
    const links = qsa('.site-nav a');
    if (!links.length) return;

    const normalizeHref = (href) => (href || '').trim().replace(/^\.?\//, '').replace(/\/+$/, '');

    const purchaseLink = links.find((link) => {
      const href = normalizeHref(link.getAttribute('href'));
      const label = (link.textContent || '').trim();
      return href === 'products.html' || /offer\s*board/i.test(label) || /^products$/i.test(label);
    });

    if (!purchaseLink) return;

    purchaseLink.textContent = 'Purchase';
    purchaseLink.classList.add('nav-purchase');
  };

  const syncHeaderHeightVar = () => {
    const header = qs('.site-header');
    if (!header) return;

    const update = () => {
      const height = header.offsetHeight || 0;
      if (height) {
        document.documentElement.style.setProperty('--site-header-height', `${height}px`);
      }
    };

    update();
    window.addEventListener('resize', () => window.requestAnimationFrame(update));
  };

  const injectPetAppNavLink = () => {
    const navList = qs('.site-nav ul');
    if (!navList) return;

    const already = qsa('a', navList).some((a) => (a.getAttribute('href') || '').includes(petApp.href));
    if (already) return;

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = petApp.href;
    a.textContent = petApp.label;

    const currentPath = (window.location.pathname || '').split('/').pop() || 'index.html';
    if (currentPath === petApp.href) {
      a.classList.add('is-active');
    }

    li.appendChild(a);

    // Insert just before "About" so About stays the rightmost tab.
    const aboutLink = qsa('a', navList).find((link) => (link.getAttribute('href') || '') === 'about.html');
    const aboutLi = aboutLink?.closest('li') || null;
    if (aboutLi && aboutLi.parentElement === navList) {
      navList.insertBefore(li, aboutLi);
      return;
    }

    navList.appendChild(li);
  };

  const injectNelliesGardenNavLink = () => {
    const navList = qs('.site-nav ul');
    if (!navList) return;

    const already = qsa('a', navList).some((a) => (a.getAttribute('href') || '').includes(nelliesGardenPage.href));
    if (already) return;

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = nelliesGardenPage.href;
    a.textContent = nelliesGardenPage.label;

    const currentPath = (window.location.pathname || '').split('/').pop() || 'index.html';
    if (currentPath === nelliesGardenPage.href) {
      a.classList.add('is-active');
    }

    li.appendChild(a);

    // Insert just before "About" so About stays toward the right side of nav.
    const aboutLink = qsa('a', navList).find((link) => (link.getAttribute('href') || '') === 'about.html');
    const aboutLi = aboutLink?.closest('li') || null;
    if (aboutLi && aboutLi.parentElement === navList) {
      navList.insertBefore(li, aboutLi);
      return;
    }

    navList.appendChild(li);
  };

  const setupPwa = () => {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        console.warn('Service worker registration failed', error);
      });
    });
  };

  const setupInstallPrompt = () => {
    let deferredPrompt = null;
    const installButtons = qsa('[data-install-app]');
    const installHelp = qs('[data-install-help]');

    const setInstallVisible = (isVisible) => {
      installButtons.forEach((btn) => (btn.hidden = !isVisible));
      // iOS doesn't fire beforeinstallprompt; keep the help text visible there.
      if (installHelp) {
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
        installHelp.hidden = isVisible || !isIos ? true : false;
      }
    };

    setInstallVisible(false);

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      setInstallVisible(true);
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      setInstallVisible(false);
    });

    installButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } finally {
          deferredPrompt = null;
          setInstallVisible(false);
        }
      });
    });
  };

  const setupCart = () => {
    if (cartToggle) {
      cartToggle.addEventListener('click', openCart);
    }

    if (cartClose) {
      cartClose.addEventListener('click', closeCart);
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeCart();
      }
    });

    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        if (!cart.length) {
          openThankYouModal({
            title: 'Cart is empty',
            message: 'Add a formulation to your cart to continue to checkout.'
          });
          return;
        }
        openThankYouModal({
          title: 'Checkout',
          message: 'Thank you! Checkout flow will be connected to your e-commerce platform.'
        });
      });
    }
  };

  const disableNativeCartUi = () => {
    if (!hasShopifyBuyButton) return;

    if (cartToggle) {
      cartToggle.hidden = true;
      cartToggle.setAttribute('aria-hidden', 'true');
    }

    if (cartPanel) {
      cartPanel.remove();
      uiState.cartOpen = false;
    }
  };

  const disableComingSoonProductButtons = () => {
    qsa('[data-add-to-cart]').forEach((button) => {
      const productContainer = getProductContainerFromButton(button);
      const isComingSoon = isComingSoonProduct(productContainer);
      if (!isComingSoon) return;

      button.type = 'button';
      button.disabled = false;
      button.setAttribute('aria-disabled', 'false');
      button.dataset.notifyMe = 'true';
      button.textContent = 'Notify Me';
      button.classList.remove('btn-primary');
      button.classList.add('btn-outline');
    });
  };

  const setupProductButtons = () => {
    qsa('[data-add-to-cart]').forEach((button) => {
      if (button.dataset.notifyMe === 'true') return;
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-product-id');
        const name = button.getAttribute('data-product-name');
        const price = parseFloat(button.getAttribute('data-product-price')) || 0;
        if (!id || !name) return;
        addToCart({ id, name, price });
        button.blur();
      });
    });
  };

  const setupProductFiltering = () => {
    const products = qsa('[data-product-card]');
    if (!products.length) return;

    const searchInput = qs('[data-product-search]');
    const buttons = qsa('.chip[data-filter]');

    const initialFilterButton =
      buttons.find((button) => button.classList.contains('is-active')) ||
      buttons.find((button) => button.getAttribute('aria-selected') === 'true');

    let activeFilter = initialFilterButton?.getAttribute('data-filter') || 'all';
    let searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const applyFilters = () => {
      products.forEach((product) => {
        const categoryAttr = product.getAttribute('data-category') || '';
        const categories = categoryAttr.split(' ').filter(Boolean);
        const matchesFilter = activeFilter === 'all' || categories.includes(activeFilter);
        const matchesSearch = !searchTerm || product.textContent.toLowerCase().includes(searchTerm);
        product.style.display = matchesFilter && matchesSearch ? '' : 'none';
      });
    };

    if (searchInput) {
      const handleSearch = () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        applyFilters();
      };

      searchInput.addEventListener('input', handleSearch);
      searchInput.addEventListener('search', handleSearch);
    }

    if (buttons.length) {
      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          const selected = button.getAttribute('data-filter') || 'all';
          if (selected === activeFilter) return;

          activeFilter = selected;

          buttons.forEach((btn) => {
            const isActive = btn === button;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
          });

          applyFilters();
        });
      });
    }

    applyFilters();
  };

  const setupAccordions = () => {
    qsa('.accordion').forEach((accordion) => {
      const triggers = qsa('.accordion__trigger', accordion);
      triggers.forEach((trigger) => {
        const content = trigger.nextElementSibling;
        if (!content) return;

        trigger.addEventListener('click', () => {
          const expanded = trigger.getAttribute('aria-expanded') === 'true';
          trigger.setAttribute('aria-expanded', String(!expanded));
          content.hidden = expanded;
        });

        // initialize hidden state
        const expanded = trigger.getAttribute('aria-expanded') === 'true';
        content.hidden = !expanded;
      });
    });
  };

  const setupBundleButton = () => {
    const bundleBtn = qs('[data-open-bundle]');
    if (!bundleBtn) return;
    bundleBtn.addEventListener('click', () => {
      openThankYouModal({
        title: 'Bundle builder coming soon',
        message: 'Contact us for a custom nutrition bundle today.'
      });
    });
  };

  const setupContactForm = () => {
    const form = qs('[data-contact-form]');
    if (!form) return;

    const status = qs('[data-form-status]', form);
    const submitButton = form.querySelector('button[type="submit"]');
    const honeypot = qs('[data-honeypot]', form);

    const getEndpoint = () => {
      const dataEndpoint = (form.getAttribute('data-endpoint') || '').trim();
      if (dataEndpoint) return dataEndpoint;
      const actionEndpoint = (form.getAttribute('action') || '').trim();
      if (actionEndpoint && actionEndpoint !== '#') return actionEndpoint;
      return '';
    };

    const setStatus = (type, message) => {
      if (!status) return;
      status.classList.remove('form-status--success', 'form-status--error');

      if (!message) {
        status.hidden = true;
        status.textContent = '';
        return;
      }

      if (type === 'success') {
        status.classList.add('form-status--success');
      } else if (type === 'error') {
        status.classList.add('form-status--error');
      }

      status.hidden = false;
      status.textContent = message;
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (honeypot && honeypot.value.trim()) {
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const endpoint = getEndpoint();
      const isPlaceholderEndpoint = endpoint.includes('YOUR_FORM_ID');

      if (!endpoint || isPlaceholderEndpoint) {
        setStatus(
          'error',
          'Online submissions are not configured yet. Email dawn@whiteeaglenutrition.com.'
        );
        return;
      }

      setStatus('', '');
      toggleButtonLoading(submitButton, true);

      const formData = new FormData(form);
      formData.delete('company');
      formData.append('submittedAt', new Date().toISOString());

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json'
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        openThankYouModal({
          title: 'Thank you!',
          message: 'We’ve received your message. Our nutrition team will reply within one business day.'
        });
        setStatus('success', 'Thank you! We’ve received your message.');
        form.reset();
      } catch (error) {
        console.error('Contact form submission failed', error);
        openThankYouModal({
          title: 'Could not send message',
          message: 'Please try again in a moment. If this keeps happening, email dawn@whiteeaglenutrition.com.'
        });
        setStatus('error', 'We could not send your message.');
      } finally {
        toggleButtonLoading(submitButton, false);
      }
    });
  };

  const setupNewsletterForms = () => {
    const forms = qsa('form.newsletter-form, form.subscription-form');
    if (!forms.length) return;

    const getEndpoint = (form) => {
      const dataEndpoint = (form.getAttribute('data-endpoint') || '').trim();
      if (dataEndpoint) return dataEndpoint;
      const actionEndpoint = (form.getAttribute('action') || '').trim();
      if (actionEndpoint && actionEndpoint !== '#') return actionEndpoint;
      return defaultFormspreeEndpoint;
    };

    forms.forEach((form) => {
      const submitButton = form.querySelector('button[type="submit"]');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        const endpoint = getEndpoint(form);
        const isPlaceholderEndpoint = endpoint.includes('YOUR_FORM_ID');

        if (!endpoint || isPlaceholderEndpoint) {
          openThankYouModal({
            title: 'Unable to subscribe',
            message: 'Online signups are not configured yet. Please email info@whiteeaglenutrition.com.'
          });
          return;
        }

        toggleButtonLoading(submitButton, true);

        const formData = new FormData(form);
        formData.append('formName', form.classList.contains('subscription-form') ? 'subscription-form' : 'newsletter-form');
        formData.append('_subject', 'White Eagle Nutrition newsletter signup');
        formData.append('source', window.location.href);
        formData.append('submittedAt', new Date().toISOString());

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Accept: 'application/json'
            },
            body: formData
          });

          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }

          openThankYouModal({
            title: 'Thank you!',
            message: 'You’re subscribed. Watch your inbox for next month’s science brief.'
          });
          form.reset();
        } catch (error) {
          console.error('Newsletter form submission failed', error);
          openThankYouModal({
            title: 'Could not subscribe',
            message: 'Please try again in a moment. If this keeps happening, email info@whiteeaglenutrition.com.'
          });
        } finally {
          toggleButtonLoading(submitButton, false);
        }
      });
    });
  };

  const setupNonSubmittingSearchForms = () => {
    const forms = qsa('form[role="search"]');
    if (!forms.length) return;
    forms.forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
      });
    });
  };

  const setupFrassBuyAnchorRouting = () => {
    const path = (window.location.pathname || '').toLowerCase();
    const isProductsPage =
      path.endsWith('/products') ||
      path.endsWith('/products/') ||
      path.endsWith('/products.html') ||
      path === 'products.html';

    if (!isProductsPage) return;

    const legacyHash = '#frass';
    const buyHash = '#frass-buy';

    const routeToBuyAnchor = () => {
      if ((window.location.hash || '').toLowerCase() !== legacyHash) return;

      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${buyHash}`);
      } else {
        window.location.hash = buyHash;
      }

      const target = document.getElementById('frass-buy');
      if (target) {
        target.scrollIntoView({ block: 'start' });
      }
    };

    routeToBuyAnchor();
    window.addEventListener('hashchange', routeToBuyAnchor);
  };

  const updateYear = () => {
    const yearSpan = qs('[data-current-year]');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  };

  const init = () => {
    if (hasShopifyBuyButton) {
      disableNativeCartUi();
    } else {
      loadCart();
      renderCart();
      updateCartSummary();
    }
    disableComingSoonProductButtons();
    setupNotifyMeButtons();
    syncHeaderHeightVar();
    injectNelliesGardenNavLink();
    injectPetAppNavLink();
    setupPurchaseNavCta();
    setupNavigation();
    if (!hasShopifyBuyButton) {
      setupCart();
      setupProductButtons();
    }
    setupProductFiltering();
    setupAccordions();
    setupBundleButton();
    setupContactForm();
    setupNewsletterForms();
    setupNonSubmittingSearchForms();
    setupFrassBuyAnchorRouting();
    setupPwa();
    setupInstallPrompt();
    updateYear();
    setupThankYouModalGlobalEvents();
    sendPageViewToMetaCapi();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
