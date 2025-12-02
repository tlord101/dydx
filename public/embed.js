(function (global) {
  // Simple embed helper to open the signing app in a popup and receive the result.
  // Usage:
  // <script src="/embed.js"></script>
  // const popup = await window.Permit2Embed.open('<APP_URL>');
  // popup.then(result => console.log(result)).catch(err => console.error(err));

  function openPopup(url, name, width = 420, height = 760) {
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const features = `width=${width},height=${height},left=${left},top=${top},popup=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no`;
    return window.open(url, name || 'permit2_popup', features);
  }

  async function open(appUrl, opts = {}) {
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
        // Optionally, the consumer can check e.origin here
        const data = e.data;
        if (!data || data.type !== 'permit2_result') return;
        cleanup();
        resolve(data);
      }

      window.addEventListener('message', onMessage, false);

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('timeout waiting for permit result'));
      }, opts.timeout || 10 * 60 * 1000);
    });
  }

  global.Permit2Embed = {
    open
  };
})(window);
