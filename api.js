(function () {
  'use strict';
  const config = window.TEACHER_COMMUNITY_CONFIG || {};

  function getApiUrl() {
    const value = String(config.API_URL || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(value)) return '';
    return value;
  }

  function jsonp(params) {
    const apiUrl = getApiUrl();
    if (!apiUrl) return Promise.reject(new Error('CONFIG_MISSING'));
    return new Promise(function (resolve, reject) {
      const cbName = 'cb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      const script = document.createElement('script');
      const timeout = window.setTimeout(function () { cleanup(); reject(new Error('REQUEST_TIMEOUT')); }, 12000);
      let finished = false;
      function cleanup() {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cbName] = function (data) { cleanup(); resolve(data); };
      const query = new URLSearchParams(Object.assign({}, params, { callback: cbName, _ts: Date.now() }));
      script.async = true;
      script.src = apiUrl + (apiUrl.indexOf('?') >= 0 ? '&' : '?') + query.toString();
      script.onerror = function () { cleanup(); reject(new Error('REQUEST_FAILED')); };
      document.head.appendChild(script);
    });
  }

  function getClientKey() {
    const keyName = 'teacherCommunityClientKey';
    try {
      let key = window.localStorage.getItem(keyName);
      if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) {
        key = 'tc_' + createRandomToken();
        window.localStorage.setItem(keyName, key);
      }
      return key;
    } catch (_) {
      return 'tc_' + createRandomToken();
    }
  }

  function createRandomToken() {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(18);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  }

  function wait(ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); }

  async function submit(payload) {
    const apiUrl = getApiUrl();
    if (!apiUrl) throw new Error('CONFIG_MISSING');
    const requestId = createRandomToken() + '_' + createRandomToken();
    payload.requestId = requestId;
    payload.clientKey = getClientKey();

    // Cross-origin HTML form submission avoids a fetch preflight. Response is checked via safe JSONP polling.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = apiUrl;
    form.target = 'postFrame';
    form.acceptCharset = 'UTF-8';
    form.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    input.value = JSON.stringify(payload);
    const requestInput = document.createElement('input');
    requestInput.type = 'hidden';
    requestInput.name = 'requestId';
    requestInput.value = requestId;
    form.appendChild(input);
    form.appendChild(requestInput);
    document.body.appendChild(form);
    try {
      form.submit();
    } finally {
      window.setTimeout(function () { if (form.parentNode) form.parentNode.removeChild(form); }, 1500);
    }

    for (let attempt = 0; attempt < 18; attempt += 1) {
      await wait(attempt === 0 ? 800 : 700);
      const status = await jsonp({ action: 'getSubmissionStatus', requestId: requestId });
      if (status && status.state === 'success') {
        if (status.verified === true && status.id && status.sheetName && Number(status.rowNumber) >= 2) return status;
        throw new Error('API_VERSION_OLD');
      }
      if (status && status.state === 'error') throw new Error(status.message || 'SUBMISSION_FAILED');
    }
    throw new Error('SUBMISSION_PENDING');
  }

  window.TeacherCommunityAPI = {
    isConfigured: function () { return !!getApiUrl(); },
    getOptions: function () { return jsonp({ action: 'getOptions' }); },
    searchProblems: function (params) { return jsonp(Object.assign({ action: 'searchProblems' }, params || {})); },
    getProblem: function (id) { return jsonp({ action: 'getProblem', id: id }); },
    submitProblem: function (data) { return submit({ action: 'submitProblem', data: data, website: data.website || '' }); },
    submitSolution: function (data) { return submit({ action: 'submitSolution', data: data, website: data.website || '' }); },
    reportContent: function (data) { return submit({ action: 'reportContent', data: data, website: '' }); }
  };
})();
