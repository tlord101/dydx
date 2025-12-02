// Minimal SDK for opening Permit2 signing popup and binding to buttons.
function openPopup(url, name, width = 420, height = 760) {
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  const features = `width=${width},height=${height},left=${left},top=${top},popup=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no`;
  return window.open(url, name || 'permit2_popup', features);
}

function open(appUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!appUrl) return reject(new Error('appUrl required'));

    const targetOrigin = opts.targetOrigin || window.location.origin || '*';
    const popupUrl = appUrl + (appUrl.includes('?') ? '&' : '?') + 'embed=1&target_origin=' + encodeURIComponent(targetOrigin);

    const w = openPopup(popupUrl, opts.windowName || 'permit2_popup', opts.width || 420, opts.height || 760);
    if (!w) return reject(new Error('Popup blocked'));

    let timeoutId = null;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timeoutId) clearTimeout(timeoutId);
      try { if (w && !w.closed) w.close(); } catch(e) {}
    };

    function onMessage(e) {
      try {
        const data = e.data;
        if (!data || data.type !== 'permit2_result') return;
        cleanup();
        resolve(data);
      } catch (err) { /* ignore */ }
    }

    window.addEventListener('message', onMessage, false);

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for permit result'));
    }, opts.timeout || 10 * 60 * 1000);
  });
}

function attach(selectorOrElement, appUrl, opts = {}) {
  if (!appUrl) throw new Error('appUrl required');

  const binder = (el) => {
    if (!el) return;
    const handler = async (ev) => {
      ev.preventDefault();
      try {
        const result = await open(appUrl, opts);
        if (typeof opts.onResult === 'function') opts.onResult(result);
      } catch (err) {
        if (typeof opts.onError === 'function') opts.onError(err);
      }
    };
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  };

  if (typeof selectorOrElement === 'string') {
    const nodes = document.querySelectorAll(selectorOrElement);
    const unbinds = [];
    nodes.forEach(n => { unbinds.push(binder(n)); });
    return () => unbinds.forEach(u => u && u());
  } else if (selectorOrElement instanceof Element) {
    return binder(selectorOrElement);
  } else {
    throw new Error('selectorOrElement must be selector string or DOM Element');
  }
}

function verify(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.type !== 'permit2_result') return false;
  if (!result.owner || !result.signature) return false;
  return true;
}

// Auto-attach elements with data-permit2-app
if (typeof window !== 'undefined' && document) {
  const doAttach = () => {
    const nodes = document.querySelectorAll('[data-permit2-app]');
    nodes.forEach(el => {
      try {
        const appUrl = el.getAttribute('data-permit2-app');
        const targetOrigin = el.getAttribute('data-target-origin') || window.location.origin;
        attach(el, appUrl, { targetOrigin });
      } catch (e) { /* ignore */ }
    });
  };
  if (document.readyState !== 'loading') doAttach(); else document.addEventListener('DOMContentLoaded', doAttach);
}

export default {
  open,
  attach,
  verify
};
