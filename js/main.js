/* ============================================
   Lewis County Autism Coalition - Main JS
   Animations, Dark Mode, Counters, Progress Bar
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ============ MOBILE MENU ============
  const toggle = document.querySelector('.navbar__toggle');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
      toggle.setAttribute('aria-expanded', mobileMenu.classList.contains('open'));
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        toggle.classList.remove('active');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ============ NAVBAR SCROLL EFFECT ============
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // ============ SCROLL PROGRESS BAR ============
  const progressBar = document.createElement('div');
  progressBar.className = 'scroll-progress';
  document.body.appendChild(progressBar);

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = progress + '%';
  }, { passive: true });

  // ============ SCROLL ANIMATIONS ============
  requestAnimationFrame(() => {
    document.body.classList.add('js-ready');

    const animatedElements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .stagger');
    if (animatedElements.length) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.05, rootMargin: '0px 0px 50px 0px' });

      animatedElements.forEach(el => observer.observe(el));
    }
  });

  // ============ ANIMATED STAT COUNTERS ============
  const counterElements = document.querySelectorAll('.stat__number');
  if (counterElements.length) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    counterElements.forEach(el => counterObserver.observe(el));
  }

  function animateCounter(el) {
    const text = el.textContent.trim();
    const match = text.match(/^([\d,]+)/);
    if (!match) return; // non-numeric like "501(c)(3)"

    const target = parseInt(match[1].replace(/,/g, ''));
    const suffix = text.replace(match[1], '');
    const duration = 2000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);
      el.textContent = current.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }

    el.textContent = '0' + suffix;
    requestAnimationFrame(update);
  }

  // ============ DARK MODE TOGGLE ============
  const darkToggle = document.createElement('button');
  darkToggle.className = 'dark-mode-toggle';
  darkToggle.setAttribute('aria-label', 'Toggle dark mode');
  darkToggle.innerHTML = `
    <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  `;

  const navInner = document.querySelector('.navbar__inner');
  if (navInner) {
    navInner.appendChild(darkToggle);
  }

  // Check saved preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  darkToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
  });

  // ============ FLOATING DONATE BUTTON ============
  const floatingDonate = document.createElement('a');
  // Determine correct donate path based on current page depth
  const isSubpage = window.location.pathname.includes('/pages/');
  const donatePath = isSubpage ? 'donate.html' : 'pages/donate.html';
  floatingDonate.href = donatePath;
  floatingDonate.className = 'floating-donate';
  floatingDonate.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    <span>Donate</span>
  `;
  document.body.appendChild(floatingDonate);

  // Show floating donate after scrolling past hero
  window.addEventListener('scroll', () => {
    floatingDonate.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  // ============ BACK TO TOP ============
  const backToTop = document.querySelector('.back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 500);
    }, { passive: true });

    backToTop.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ============ FAQ ACCORDION ============
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  // ============ ACTIVE NAV LINK ============
  const hasActive = document.querySelector('.navbar__link.active');
  if (!hasActive) {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.navbar__link, .mobile-menu__link').forEach(link => {
      const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '') || '/';
      if (linkPath === currentPath) {
        link.classList.add('active');
      }
    });
  }

  // ============ FORM VALIDATION ============
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Sent!';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
          form.reset();
        }, 3000);
      }
    });
  });

  // ============ CARD TILT EFFECT ============
  // Only apply to small info/program cards, skip cards containing forms or large content
  document.querySelectorAll('.card').forEach(card => {
    if (card.querySelector('form, .form-input, .form-textarea, textarea, input[type="text"], input[type="email"]')) return;
    if (card.offsetHeight > 400) return; // skip large cards

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / 30;
      const rotateY = (centerX - x) / 30;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // ============================================================
  // COOKIE CONSENT BANNER
  // GDPR / CCPA compliant cookie consent.
  // Shows on first visit; remembers choice in localStorage.
  // Granular opt-in/opt-out: "essential" (always on) vs "analytics".
  // If analytics is declined, the GA4 script remains inert.
  // ============================================================
  (function initCookieBanner() {
    const STORAGE_KEY = 'lcac-cookie-consent-v1';
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
      catch { return null; }
    })();

    // Already chose — respect it and exit
    if (stored && (stored.accepted === true || stored.accepted === false)) {
      if (stored.analytics) window.__lcacAnalyticsConsent = true;
      return;
    }

    // Build banner
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.innerHTML = `
      <div class="cookie-banner__inner">
        <div class="cookie-banner__text">
          <strong>We value your privacy.</strong>
          We use essential cookies to make this site work, and optional analytics cookies
          to understand how our site is used (you can decline). For details, see our
          <a href="/pages/privacy.html" style="text-decoration: underline;">Privacy Policy</a>.
        </div>
        <div class="cookie-banner__actions">
          <button type="button" class="cookie-banner__btn cookie-banner__btn--secondary" data-action="decline">Essential Only</button>
          <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" data-action="accept">Accept All</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    function save(acceptedAll) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          accepted: acceptedAll,
          analytics: acceptedAll,
          essential: true,
          timestamp: new Date().toISOString(),
        }));
      } catch { /* ignore */ }
      if (acceptedAll) window.__lcacAnalyticsConsent = true;
      banner.classList.add('cookie-banner--closing');
      setTimeout(() => banner.remove(), 300);
    }

    banner.querySelector('[data-action="accept"]').addEventListener('click', () => save(true));
    banner.querySelector('[data-action="decline"]').addEventListener('click', () => save(false));

    // Show banner with slight delay so it doesn't flash during page load
    setTimeout(() => banner.classList.add('cookie-banner--visible'), 400);
  })();

  // ============================================================
  // FORM SUBMISSION ENHANCEMENT
  // For every form that posts to Web3Forms, intercept the submit,
  // show a loading state + success/error message inline so we don't
  // navigate the user away from the site. Falls back to normal form
  // behaviour if JS is disabled (form still posts to Web3Forms).
  // ============================================================
  document.querySelectorAll('form[action*="web3forms.com"]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      // Skip enhancement if the endpoint is still the placeholder
      const endpoint = form.getAttribute('action') || '';
      const accessKeyField = form.querySelector('input[name="access_key"]');
      const accessKey = accessKeyField ? accessKeyField.value : '';
      if (accessKey.includes('[[WEB3FORMS_')) {
        // Prevent a broken POST to an unconfigured endpoint
        e.preventDefault();
        showStatus(form, 'Form submission is not fully configured yet. Please contact info@lcautism.org directly.', 'warn');
        return;
      }

      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }
      showStatus(form, '', 'neutral');

      try {
        const fd = new FormData(form);
        const res = await fetch(endpoint, {
          method: 'POST',
          body: fd,
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          form.reset();
          showStatus(form, 'Thank you! Your message has been sent. We will reach out soon.', 'ok');
        } else {
          const data = await res.json().catch(() => ({}));
          const msg = (data && data.errors && data.errors[0] && data.errors[0].message)
            || 'Something went wrong. Please try again — or email info@lcautism.org directly.';
          showStatus(form, msg, 'err');
        }
      } catch (err) {
        showStatus(form, 'Network error. Please try again — or email info@lcautism.org directly.', 'err');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    });
  });

  function showStatus(form, message, tone) {
    // Find a status container if one exists near the form
    const statusEl = form.querySelector('[id$="form-status"]');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.padding = message ? '0.75em 1em' : '0';
    statusEl.style.borderRadius = '8px';
    statusEl.style.fontSize = '0.95em';
    statusEl.style.background =
      tone === 'ok' ? '#e8f5e9' :
      tone === 'err' ? '#fdecea' :
      tone === 'warn' ? '#fff4e5' : 'transparent';
    statusEl.style.color =
      tone === 'ok' ? '#1b5e20' :
      tone === 'err' ? '#c62828' :
      tone === 'warn' ? '#8a5300' : 'inherit';
    statusEl.style.border =
      tone === 'ok' ? '1px solid #a5d6a7' :
      tone === 'err' ? '1px solid #f5c6cb' :
      tone === 'warn' ? '1px solid #ffd28a' : 'none';
  }

});
