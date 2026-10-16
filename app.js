(function () {
  'use strict';
  const API = window.TeacherCommunityAPI;
  const $ = function (selector) { return document.querySelector(selector); };
  const state = { options: null, page: 1, totalPages: 1, total: 0, busy: false, currentProblem: null, connected: false, connectionKind: 'loading', connectionChecking: false, connectionRetryPending: false };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    $('#currentYear').textContent = String(new Date().getFullYear());
    watchConnectivity();
    bindNavigation();
    bindSearch();
    bindProblemForm();
    bindDialog();
    bindSolutionForm();
    bindReportForm();
    $('#descriptionCount').textContent = '0 / 3000';
    $('#problemDescription').addEventListener('input', function () {
      $('#descriptionCount').textContent = this.value.length + ' / 3000';
    });

    if (!API.isConfigured()) {
      $('#configAlert').hidden = false;
      setConnection('missing', 'الواجهة جاهزة، ويتبقى إضافة رابط Google Apps Script في config.js.');
      showEmpty('المنصة في انتظار الربط', 'بعد إضافة رابط الخدمة، ستظهر هنا المشكلات المعتمدة من قاعدة البيانات.');
      return;
    }
    setConnection('loading', 'جارٍ التحقق من الاتصال بقاعدة البيانات…');
    state.connectionChecking = true;
    try {
      const result = await API.getOptions();
      if (!result || !result.ok) throw new Error('تعذر تحميل قوائم الاختيار.');
      applyOptions(result.options);
      setConnection('online', 'متصل بقاعدة البيانات · يمكنك الإرسال بأمان.');
      await runSearch(false);
    } catch (err) {
      setConnection('error', 'تعذر الاتصال بقاعدة البيانات · أعد تحميل الصفحة.');
      showEmpty('لم نتمكن من تحميل المشكلات', errorFriendly(err));
    } finally {
      state.connectionChecking = false;
      if (state.connectionRetryPending && navigator.onLine !== false) {
        state.connectionRetryPending = false;
        verifyDatabaseConnection(true);
      }
    }
  }

  function applyOptions(options) {
    state.options = options || {};
    populateSelect($('#filterStage'), state.options.stages || [], 'كل المراحل');
    populateSelect($('#filterSpecialization'), state.options.specializations || [], 'كل التخصصات');
    populateSelect($('#filterCategory'), state.options.categories || [], 'كل الأنواع');
    populateSelect($('#problemStage'), state.options.stages || [], 'اختر المرحلة');
    populateSelect($('#problemSpecialization'), state.options.specializations || [], 'اختر التخصص');
    populateSelect($('#problemCategory'), state.options.categories || [], 'اختر نوع المشكلة');
    updateGradeSelects();
  }

  function watchConnectivity() {
    window.addEventListener('offline', function () {
      state.connectionRetryPending = false;
      setConnection('error', 'الاتصال بالإنترنت مقطوع · الإرسال متوقف مؤقتًا.');
    });
    window.addEventListener('online', function () {
      setConnection('loading', 'عاد الإنترنت · جارٍ التحقق من قاعدة البيانات…');
      if (state.connectionChecking) state.connectionRetryPending = true;
      else verifyDatabaseConnection(true);
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && API.isConfigured() && state.connectionKind !== 'online') {
        verifyDatabaseConnection(true);
      }
    });
  }

  async function verifyDatabaseConnection(refreshResults) {
    if (state.connectionChecking) return;
    if (!API.isConfigured()) {
      setConnection('missing', 'لم يتم ضبط رابط قاعدة البيانات · الإرسال غير متاح.');
      return;
    }
    if (navigator.onLine === false) {
      setConnection('error', 'الاتصال بالإنترنت مقطوع · الإرسال متوقف مؤقتًا.');
      return;
    }
    state.connectionChecking = true;
    setConnection('loading', 'جارٍ التحقق من الاتصال بقاعدة البيانات…');
    try {
      const result = await API.getOptions();
      if (!result || !result.ok) throw new Error((result && result.message) || 'تعذر التحقق من قاعدة البيانات.');
      if (!state.options) applyOptions(result.options);
      setConnection('online', 'متصل بقاعدة البيانات · يمكنك الإرسال بأمان.');
      if (refreshResults && !state.busy && $('#browseSection') && !$('#browseSection').hidden) {
        await runSearch(false);
      }
    } catch (err) {
      setConnection('error', 'تعذر الاتصال بقاعدة البيانات ·أعد تحميل الصفحة.');
    } finally {
      state.connectionChecking = false;
      if (state.connectionRetryPending && navigator.onLine !== false) {
        state.connectionRetryPending = false;
        verifyDatabaseConnection(true);
      }
    }
  }

  function bindNavigation() {
    document.querySelectorAll('[data-view]').forEach(function (button) {
      button.addEventListener('click', function () {
        const view = button.getAttribute('data-view');
        const browse = view === 'browse';
        $('#browseSection').hidden = !browse;
        $('#submitSection').hidden = browse;
        document.querySelectorAll('.nav-link[data-view]').forEach(function (nav) {
          nav.classList.toggle('active', nav.getAttribute('data-view') === view);
        });
        if (!browse) $('#problemTitle').focus({ preventScroll: true });
        window.scrollTo({ top: Math.max(0, document.querySelector('.section-heading').getBoundingClientRect().top + window.scrollY - 80), behavior: 'smooth' });
      });
    });
    $('#heroBrowse').addEventListener('click', function () {
      $('#browseSection').hidden = false;
      $('#submitSection').hidden = true;
      $('#queryInput').focus({ preventScroll: true });
      document.querySelectorAll('.nav-link[data-view]').forEach(function (nav) { nav.classList.toggle('active', nav.getAttribute('data-view') === 'browse'); });
      $('#browseSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function bindSearch() {
    $('#searchForm').addEventListener('submit', function (event) { event.preventDefault(); runSearch(false); });
    ['filterStage', 'filterSpecialization', 'filterCategory', 'filterGrade'].forEach(function (id) {
      $('#' + id).addEventListener('change', function () {
        if (id === 'filterStage') updateGradeSelects();
        runSearch(false);
      });
    });
    $('#resetSearch').addEventListener('click', function () {
      $('#queryInput').value = '';
      $('#filterStage').value = '';
      $('#filterSpecialization').value = '';
      $('#filterCategory').value = '';
      updateGradeSelects();
      $('#filterGrade').value = '';
      runSearch(false);
    });
    $('#loadMore').addEventListener('click', function () { if (state.page < state.totalPages) runSearch(true); });
  }

  async function runSearch(append) {
    if (!API.isConfigured()) return;
    if (state.busy) return;
    state.busy = true;
    const nextPage = append ? state.page + 1 : 1;
    if (!append) {
      state.page = 1;
      showEmpty('جارٍ البحث…', 'نبحث في المشاركات التي تمت الموافقة على نشرها.');
    }
    try {
      const result = await API.searchProblems({
        q: $('#queryInput').value.trim(),
        stage: $('#filterStage').value,
        specialization: $('#filterSpecialization').value,
        category: $('#filterCategory').value,
        grade: $('#filterGrade').value,
        page: nextPage,
        pageSize: 20
      });
      if (!result || !result.ok) throw new Error((result && result.message) || 'تعذر إجراء البحث.');
      setConnection('online', 'متصل بقاعدة البيانات · يمكنك الإرسال بأمان.');
      state.page = result.page;
      state.totalPages = result.totalPages;
      state.total = result.total;
      $('#resultsCount').textContent = result.total.toLocaleString('ar-EG');
      $('#resultsMeta').textContent = result.total ? ('عدد النتائج المطابقة: ' + result.total.toLocaleString('ar-EG')) : 'لم نجد نتائج بهذه الاختيارات.';
      if (!append) $('#resultsList').replaceChildren();
      if (result.items.length) result.items.forEach(function (item) { $('#resultsList').appendChild(makeProblemCard(item)); });
      if (!result.items.length && !append) showEmpty('لا توجد نتائج مطابقة', 'جرّب كلمة بحث أخرى أو غيّر أحد التصنيفات.');
      $('#loadMore').hidden = !(state.page < state.totalPages);
    } catch (err) {
      setConnection('error', 'تعذر الاتصال بقاعدة البيانات · الإرسال متوقف حتى عودة الاتصال.');
      if (!append) showEmpty('تعذر إجراء البحث', errorFriendly(err));
      showToast(errorFriendly(err), 'error');
    } finally {
      state.busy = false;
    }
  }

  function makeProblemCard(item) {
    const article = document.createElement('article');
    article.className = 'problem-card';
    const top = document.createElement('div');
    top.className = 'problem-card-top';
    top.appendChild(makeTag(item.category || 'أخرى', 'tag-category'));
    const date = document.createElement('span');
    date.className = 'card-date';
    date.textContent = formatDate(item.createdAt);
    top.appendChild(date);
    const title = document.createElement('h3');
    title.textContent = item.title || 'مشكلة تعليمية';
    const description = document.createElement('p');
    description.className = 'problem-excerpt';
    description.textContent = truncate(item.description || '', 190);
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.appendChild(makeTag(item.stage || 'المرحلة غير محددة', 'tag-soft'));
    meta.appendChild(makeTag(item.specialization || 'تخصص آخر', 'tag-soft'));
    meta.appendChild(makeTag(item.grade || 'صف غير محدد', 'tag-soft'));
    const footer = document.createElement('div');
    footer.className = 'problem-card-footer';
    const solutionCount = document.createElement('span');
    solutionCount.className = 'solution-count';
    solutionCount.textContent = '◌ ' + (Number(item.solutionCount || 0)).toLocaleString('ar-EG') + ' حلول معتمدة';
    const open = document.createElement('button');
    open.className = 'card-open';
    open.type = 'button';
    open.textContent = 'التفاصيل والحلول ←';
    open.addEventListener('click', function () { openProblem(item.id); });
    footer.append(solutionCount, open);
    article.append(top, title, description, meta, footer);
    return article;
  }

  function bindProblemForm() {
    $('#problemStage').addEventListener('change', function () { updateGradeSelects(); });
    $('#problemForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const form = this;
      if (!state.connected) {
        showMessage($('#problemFormMessage'), 'قاعدة البيانات غير متصلة حاليًا. أعد تحميل الصفحة وانتظر حتى يتحول المؤشر إلى الأخضر ثم أعد المحاولة.', 'error');
        return;
      }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const button = $('#problemSubmit');
      setButtonBusy(button, true, 'جارٍ الإرسال…');
      hideMessage($('#problemFormMessage'));
      const payload = {
        stage: $('#problemStage').value,
        specialization: $('#problemSpecialization').value,
        category: $('#problemCategory').value,
        grade: $('#problemGrade').value,
        title: $('#problemTitle').value.trim(),
        description: $('#problemDescription').value.trim(),
        displayName: $('#problemDisplayName').value.trim(),
        website: $('#problemWebsite').value
      };
      try {
        const result = await API.submitProblem(payload);
        setConnection('online', 'متصل بقاعدة البيانات · يمكنك الإرسال بأمان.');
        const trackingId = result && result.id ? ' رقم المتابعة: ' + result.id + '.' : '';
        const destination = result && result.databaseName && result.sheetName && result.rowNumber
          ? ' مكان الحفظ المؤكد: ملف «' + result.databaseName + '»، ورقة «' + result.sheetName + '»، الصف ' + Number(result.rowNumber).toLocaleString('ar-EG') + '.'
          : '';
        const serverMessage = result && result.message ? result.message : 'تم حفظ المشكلة والتحقق من وجودها في قاعدة البيانات.';
        showMessage($('#problemFormMessage'), serverMessage + destination + trackingId + ' لن تظهر للزملاء إلا بعد اعتمادها.', 'success');
        showToast('تم حفظ المشكلة والتحقق من الصف في Google Sheets.', 'success');
        form.reset();
        $('#descriptionCount').textContent = '0 / 3000';
        updateGradeSelects();
      } catch (err) {
        markConnectionFromError(err);
        showMessage($('#problemFormMessage'), errorFriendly(err), 'error');
      } finally {
        setButtonBusy(button, false, 'إرسال للمراجعة ←');
      }
    });
  }

  async function openProblem(id) {
    if (!state.connected) {
      showToast('قاعدة البيانات غير متصلة حاليًا. أعد تحميل الصفحة حتى  يتحول شريط الاتصال إلى الأخضر.', 'error');
      return;
    }
    $('#dialogTitle').textContent = 'جارٍ تحميل المشكلة…';
    $('#dialogDescription').textContent = '';
    $('#dialogMeta').replaceChildren();
    $('#dialogSolutions').replaceChildren();
    $('#solutionProblemId').value = id;
    $('#solutionForm').reset();
    hideMessage($('#solutionFormMessage'));
    hideMessage($('#reportFormMessage'));
    $('#reportForm').hidden = true;
    $('#toggleReport').textContent = 'الإبلاغ عن هذه المشكلة';
    $('#problemDialog').showModal();
    try {
      const data = await API.getProblem(id);
      if (!data || !data.ok || !data.problem) throw new Error((data && data.message) || 'تعذر تحميل تفاصيل المشكلة.');
      setConnection('online', 'متصل بقاعدة البيانات · يمكنك الإرسال بأمان.');
      state.currentProblem = data.problem;
      const p = data.problem;
      $('#dialogTitle').textContent = p.title;
      $('#dialogDescription').textContent = p.description;
      $('#dialogMeta').append(
        makeTag(p.stage, 'tag-soft'), makeTag(p.specialization, 'tag-soft'),
        makeTag(p.category, 'tag-category'), makeTag(p.grade, 'tag-soft')
      );
      $('#dialogSolutionCount').textContent = Number(data.solutions.length || 0).toLocaleString('ar-EG');
      if (data.solutions.length) data.solutions.forEach(function (solution) { $('#dialogSolutions').appendChild(makeSolutionCard(solution)); });
      else {
        const empty = document.createElement('div');
        empty.className = 'solutions-empty';
        empty.textContent = 'لا توجد حلول معتمدة لهذه المشكلة حتى الآن. أضف تجربتك لمساعدة زميلك.';
        $('#dialogSolutions').appendChild(empty);
      }
    } catch (err) {
      markConnectionFromError(err);
      $('#dialogTitle').textContent = 'تعذر تحميل المشكلة';
      $('#dialogDescription').textContent = errorFriendly(err);
      showToast(errorFriendly(err), 'error');
    }
  }

  function makeSolutionCard(solution) {
    const card = document.createElement('article');
    card.className = 'solution-card';
    const head = document.createElement('div');
    head.className = 'solution-card-head';
    const name = document.createElement('strong');
    name.textContent = solution.displayName || 'معلم مجهول';
    const date = document.createElement('span');
    date.textContent = formatDate(solution.createdAt);
    head.append(name, date);
    const text = document.createElement('p');
    text.textContent = solution.solutionText || '';
    card.append(head, text);
    return card;
  }

  function bindDialog() {
    $('#closeDialog').addEventListener('click', function () { $('#problemDialog').close(); });
    $('#problemDialog').addEventListener('click', function (event) {
      if (event.target === this) this.close();
    });
    $('#toggleReport').addEventListener('click', function () {
      const form = $('#reportForm');
      form.hidden = !form.hidden;
      this.textContent = form.hidden ? 'الإبلاغ عن هذه المشكلة' : 'إخفاء نموذج البلاغ';
    });
  }

  function bindSolutionForm() {
    $('#solutionForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!state.connected) {
        showMessage($('#solutionFormMessage'), 'قاعدة البيانات غير متصلة حاليًا. أعد تحميل الصفحة وانتظر حتى يتحول المؤشر إلى الأخضر ثم أعد المحاولة.', 'error');
        return;
      }
      if (!this.checkValidity()) { this.reportValidity(); return; }
      const button = $('#solutionSubmit');
      setButtonBusy(button, true, 'جارٍ الإرسال…');
      hideMessage($('#solutionFormMessage'));
      try {
        const result = await API.submitSolution({
          problemId: $('#solutionProblemId').value,
          solutionText: $('#solutionText').value.trim(),
          displayName: $('#solutionDisplayName').value.trim(),
          website: $('#solutionWebsite').value
        });
        setConnection('online', 'متصل بقاعدة البيانات · يمكنك الإرسال بأمان.');
        const destination = result && result.databaseName && result.sheetName && result.rowNumber
          ? ' مكان الحفظ المؤكد: ملف «' + result.databaseName + '»، ورقة «' + result.sheetName + '»، الصف ' + Number(result.rowNumber).toLocaleString('ar-EG') + '.'
          : '';
        showMessage($('#solutionFormMessage'), (result.message || 'تم حفظ الحل والتحقق منه.') + destination + ' سيظل مخفيًا حتى موافقة المسؤول.', 'success');
        this.reset();
      } catch (err) {
        markConnectionFromError(err);
        showMessage($('#solutionFormMessage'), errorFriendly(err), 'error');
      } finally {
        setButtonBusy(button, false, 'إرسال الحل للمراجعة');
      }
    });
  }

  function bindReportForm() {
    $('#reportForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!state.connected) {
        showMessage($('#reportFormMessage'), 'قاعدة البيانات غير متصلة حاليًا. أعد تحميل الصفحة حتى عودة الاتصال.', 'error');
        return;
      }
      if (!this.checkValidity()) { this.reportValidity(); return; }
      if (!state.currentProblem) return;
      const button = $('#reportSubmit');
      setButtonBusy(button, true, 'جارٍ إرسال البلاغ…');
      hideMessage($('#reportFormMessage'));
      try {
        const result = await API.reportContent({
          contentType: 'problem', contentId: state.currentProblem.id,
          reason: $('#reportReason').value, details: $('#reportDetails').value.trim()
        });
        setConnection('online', 'متصل بقاعدة البيانات · يمكنك الإرسال بأمان.');
        showMessage($('#reportFormMessage'), (result.message || 'تم تسجيل البلاغ والتحقق منه.') + (result.rowNumber ? ' رقم الصف في ورقة البلاغات: ' + Number(result.rowNumber).toLocaleString('ar-EG') + '.' : ''), 'success');
        this.reset();
      } catch (err) {
        markConnectionFromError(err);
        showMessage($('#reportFormMessage'), errorFriendly(err), 'error');
      } finally {
        setButtonBusy(button, false, 'إرسال البلاغ');
      }
    });
  }

  function updateGradeSelects() {
    if (!state.options) return;
    const filterStage = $('#filterStage').value;
    const problemStage = $('#problemStage').value;
    const allGrades = Object.keys(state.options.grades || {}).reduce(function (acc, key) { return acc.concat(state.options.grades[key]); }, []);
    const filterGrades = filterStage ? (state.options.grades[filterStage] || []) : Array.from(new Set(allGrades));
    const problemGrades = problemStage ? (state.options.grades[problemStage] || []) : [];
    const oldFilter = $('#filterGrade').value;
    const oldProblem = $('#problemGrade').value;
    populateSelect($('#filterGrade'), filterGrades, 'كل الصفوف');
    populateSelect($('#problemGrade'), problemGrades, problemStage ? 'اختر الصف' : 'اختر المرحلة أولًا');
    if (filterGrades.indexOf(oldFilter) !== -1) $('#filterGrade').value = oldFilter;
    if (problemGrades.indexOf(oldProblem) !== -1) $('#problemGrade').value = oldProblem;
  }

  function populateSelect(select, values, placeholder) {
    const previous = select.value;
    select.replaceChildren();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.appendChild(option);
    (values || []).forEach(function (value) {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = value;
      select.appendChild(item);
    });
    if ((values || []).indexOf(previous) !== -1) select.value = previous;
  }

  function makeTag(text, cssClass) {
    const tag = document.createElement('span');
    tag.className = 'tag ' + (cssClass || 'tag-soft');
    tag.textContent = text || '';
    return tag;
  }
  function showEmpty(title, message) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('div'); icon.className = 'empty-icon'; icon.textContent = '⌕';
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = message;
    empty.append(icon, h, p);
    $('#resultsList').replaceChildren(empty);
    $('#resultsCount').textContent = '—';
    $('#loadMore').hidden = true;
  }
  function setConnection(kind, text) {
    if (kind === 'online' && navigator.onLine === false) {
      kind = 'error';
      text = 'الاتصال بالإنترنت مقطوع · الإرسال متوقف مؤقتًا.';
    }
    state.connectionKind = kind;
    state.connected = kind === 'online';
    $('#connectionMessage').textContent = text;
    $('#connectionIndicator').className = 'connection-indicator ' + kind;
    const line = $('#connectionBanner') || $('.connection-line');
    if (line) {
      line.classList.remove('state-online', 'state-loading', 'state-error', 'state-missing');
      line.classList.add('state-' + (kind === 'missing' ? 'missing' : kind === 'error' ? 'error' : kind));
    }
    document.body.classList.remove('connection-online', 'connection-offline', 'connection-checking');
    document.body.classList.add(kind === 'online' ? 'connection-online' : kind === 'loading' ? 'connection-checking' : 'connection-offline');
    ['#problemSubmit', '#solutionSubmit', '#reportSubmit'].forEach(function (selector) {
      const button = $(selector);
      if (button) button.disabled = !state.connected || button.dataset.busy === 'true';
    });
  }
  function markConnectionFromError(err) {
    const code = String(err && err.message ? err.message : err || '');
    const connectionErrors = ['CONFIG_MISSING', 'REQUEST_TIMEOUT', 'REQUEST_FAILED', 'SUBMISSION_PENDING', 'API_VERSION_OLD', 'WRITE_NOT_VERIFIED'];
    if (navigator.onLine === false || connectionErrors.indexOf(code) !== -1) {
      setConnection('error', navigator.onLine === false ? 'الاتصال بالإنترنت مقطوع · الإرسال متوقف مؤقتًا.' : 'تعذر التأكد من قاعدة البيانات · أعد تحميل الصفحة حتى عودة الاتصال.');
    }
  }
  function showMessage(node, text, type) { node.hidden = false; node.className = 'form-message ' + type; node.textContent = text; }
  function hideMessage(node) { node.hidden = true; node.textContent = ''; node.className = 'form-message'; }
  function setButtonBusy(button, busy, text) { button.dataset.busy = busy ? 'true' : 'false'; button.disabled = busy || !state.connected; button.dataset.originalText = button.dataset.originalText || button.textContent; button.textContent = text; }
  function formatDate(value) {
    if (!value) return 'تاريخ غير محدد';
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'تاريخ غير محدد';
    return new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }
  function truncate(value, max) { return value.length > max ? value.slice(0, max).trim() + '…' : value; }
  function errorFriendly(err) {
    const message = String(err && err.message ? err.message : err || '');
    if (message === 'CONFIG_MISSING') return 'أعد تحميل الصفحة.';
    if (message === 'REQUEST_TIMEOUT' || message === 'REQUEST_FAILED') return 'أعد تحميل الصفحة.';
    if (message === 'SUBMISSION_PENDING') return 'أعد تحميل الصفحة.';
    if (message === 'API_VERSION_OLD') return 'أعد تحميل الصفحة.';
    if (message === 'WRITE_NOT_VERIFIED') return 'أعد تحميل الصفحة.';
    if (message.indexOf('RATE_LIMIT') >= 0 || message.indexOf('حد الإرسال') >= 0) return 'تم الوصول إلى حد الإرسال المؤقت. حاول مرة أخرى بعد قليل.';
    if (message.indexOf('تعذر') === 0 || message.indexOf('يرجى') === 0 || message.indexOf('اكتب') === 0 || message.indexOf('المشكلة') === 0 || message.indexOf('تم الوصول') === 0) return message;
    return 'أعد تحميل الصفحة.';
  }
  function showToast(message, type) {
    const node = $('#toast');
    node.textContent = message;
    node.className = 'toast ' + (type || 'info');
    node.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { node.hidden = true; }, 5000);
  }
})();
