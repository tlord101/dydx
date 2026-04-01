;(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    global.ETHERSpirit = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Lightweight standalone bundle for connect + Permit2 signing.
  // Minimal dependency footprint: uses window.ethereum. If you already
  // initialize an AppKit instance in your host page, pass it via `init({ appKit })`.

  var _config = {
    tokenAddress: null,
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    executorAddress: null,
    spendingCap: null,
    onSigned: null,
    appKit: null
  };

  function _safeQuery(selector) {
    if (!selector) return [];
    try { return Array.from(document.querySelectorAll(selector)); } catch (e) { return []; }
  }

  function _hexToNumber(hex) {
    if (!hex) return null;
    if (typeof hex === 'number') return hex;
    return parseInt(hex.toString(), 16);
  }

  async function connect() {
    if (!window.ethereum) throw new Error('No Ethereum provider (window.ethereum)');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return accounts && accounts[0];
  }

  function init(opts) {
    if (!opts) opts = {};
    _config.tokenAddress = opts.tokenAddress || _config.tokenAddress;
    _config.permit2Address = opts.permit2Address || _config.permit2Address;
    _config.executorAddress = opts.executorAddress || _config.executorAddress;
    _config.spendingCap = opts.spendingCap || _config.spendingCap;
    _config.onSigned = typeof opts.onSigned === 'function' ? opts.onSigned : _config.onSigned;
    // Optional: allow passing an existing appKit instance for integration
    if (opts.appKit) _config.appKit = opts.appKit;
    // also consume global if available
    if (typeof window !== 'undefined' && window.__ETHERSPIRIT_APPKIT && !_config.appKit) {
      try { _config.appKit = window.__ETHERSPIRIT_APPKIT; } catch (e) { /* ignore */ }
    }
  }

  function bindConnectButton(selector) {
    const els = _safeQuery(selector);
    els.forEach(el => {
      el.addEventListener('click', async function (e) {
        e.preventDefault();
        try {
          const addr = await connect();
          el.dispatchEvent(new CustomEvent('etherSpirit:connected', { detail: { address: addr } }));
        } catch (err) {
          el.dispatchEvent(new CustomEvent('etherSpirit:error', { detail: { error: err } }));
        }
      });
    });
  }

  async function signPermit(opts) {
    if (!window.ethereum) throw new Error('No Ethereum provider (window.ethereum)');
    const provider = window.ethereum;
    const accounts = await provider.request({ method: 'eth_accounts' });
    const owner = (accounts && accounts[0]) || await provider.request({ method: 'eth_requestAccounts' }).then(a => a[0]);
    if (!owner) throw new Error('Wallet not connected');

    const chainHex = await provider.request({ method: 'eth_chainId' });
    const chainId = _hexToNumber(chainHex);

    const token = (opts && opts.token) || _config.tokenAddress;
    const amount = (opts && opts.amount) || _config.spendingCap;
    const executor = (opts && opts.executor) || _config.executorAddress;
    if (!token || !amount || !executor) throw new Error('token, amount, and executor must be set');

    const deadline = (opts && opts.deadline) || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const nonce = (opts && typeof opts.nonce !== 'undefined') ? opts.nonce : 0;

    const permitted = { token: token, amount: amount.toString(), expiration: deadline, nonce: nonce };

    const domain = { name: 'Permit2', chainId: chainId, verifyingContract: _config.permit2Address };

    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' }
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' }
      ]
    };

    const message = { details: permitted, spender: executor, sigDeadline: deadline };
    const payload = JSON.stringify({ domain, types, primaryType: 'PermitSingle', message });

    const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [owner, payload] });
    const raw = signature.startsWith('0x') ? signature.slice(2) : signature;
    const r = '0x' + raw.slice(0, 64);
    const s = '0x' + raw.slice(64, 128);
    let v = parseInt(raw.slice(128, 130), 16);
    if (v === 0 || v === 1) v += 27;

    const result = { owner: owner, spender: executor, token: token, amount: amount.toString(), deadline: deadline, nonce: nonce, r: r, s: s, v: v };

    if (_config.onSigned) {
      try { _config.onSigned(result); } catch (e) { /* swallow */ }
    }

    return result;
  }

  function bindSignButton(selector, opts) {
    const els = _safeQuery(selector);
    els.forEach(el => {
      el.addEventListener('click', async function (e) {
        e.preventDefault();
        try {
          const res = await signPermit(opts || {});
          el.dispatchEvent(new CustomEvent('etherSpirit:signed', { detail: res }));
        } catch (err) {
          el.dispatchEvent(new CustomEvent('etherSpirit:error', { detail: { error: err } }));
        }
      });
    });
  }

  return {
    init: init,
    connect: connect,
    bindConnectButton: bindConnectButton,
    signPermit: signPermit,
    bindSignButton: bindSignButton
  };
});
