(() => {
  const cartStorageKey = 'wenCart';
  let cart = [];

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const petApp = {
    href: 'pet-photos-app.html',
    label: 'Pet Photos App'
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
    cartPanel.classList.add('is-open');
    cartPanel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeCart = () => {
    if (!cartPanel) return;
    cartPanel.classList.remove('is-open');
    cartPanel.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
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

  const setupNavigation = () => {
    if (!navToggle || !nav) return;
    navToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    qsa('.site-nav a').forEach((link) =>
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      })
    );
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
          alert('Your cart is empty. Add a formulation to continue.');
          return;
        }
        alert('Thank you! Checkout flow would integrate with your e-commerce platform.');
      });
    }
  };

  const setupProductButtons = () => {
    qsa('[data-add-to-cart]').forEach((button) => {
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
      alert('Bundle builder coming soon. Contact us for a custom nutrition bundle today!');
    });
  };

  const setupAsyncForms = () => {
    const forms = qsa('[data-contact-form], [data-async-form]');
    if (!forms.length) return;

    forms.forEach((form) => {
      if (form.dataset.asyncBound === 'true') return;
      form.dataset.asyncBound = 'true';

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

      const isContactForm = form.hasAttribute('data-contact-form');

      const messages = {
        unconfigured:
          (form.getAttribute('data-unconfigured-message') || '').trim() ||
          (isContactForm
            ? 'Online submissions are not configured yet. Email dawn@whiteeaglenutrition.com.'
            : 'Online submissions are not configured yet. Please email info@whiteeaglenutrition.com.'),
        success:
          (form.getAttribute('data-success-message') || '').trim() ||
          (isContactForm
            ? 'Thank you! Our nutrition team will reply within one business day.'
            : 'Thank you! We received your submission.'),
        error:
          (form.getAttribute('data-error-message') || '').trim() ||
          (isContactForm
            ? 'We could not send your message. Try again shortly or email dawn@whiteeaglenutrition.com.'
            : 'We could not submit your request. Please try again shortly.')
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
          setStatus('error', messages.unconfigured);
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

          setStatus('success', messages.success);
          form.reset();
        } catch (error) {
          console.error('Form submission failed', error);
          setStatus('error', messages.error);
        } finally {
          toggleButtonLoading(submitButton, false);
        }
      });
    });
  };

  const updateYear = () => {
    const yearSpan = qs('[data-current-year]');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  };

  const init = () => {
    loadCart();
    renderCart();
    updateCartSummary();
    injectPetAppNavLink();
    setupNavigation();
    setupCart();
    setupProductButtons();
    setupProductFiltering();
    setupAccordions();
    setupBundleButton();
    setupAsyncForms();
    setupPwa();
    setupInstallPrompt();
    updateYear();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
