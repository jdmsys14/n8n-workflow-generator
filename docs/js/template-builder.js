/**
 * n8n 워크플로우 템플릿 빌더 (브라우저용)
 * 학원별 설정(config)을 받아 완전한 n8n 워크플로우 JSON을 생성합니다.
 */

(function() {
  function uuid() {
    return crypto.randomUUID();
  }

  // shared.json 인라인
  const SHARED = {
    github: {
      owner: "jdmsys14",
      repo: "student-reports",
      credential: { id: "iYWbjSLjr4R8g096", name: "(샤이니)깃허브" }
    },
    anthropic: {
      credential: { id: "FgwbptZo0k3odyut", name: "jdmath" },
      defaultModel: "claude-haiku-4-5-20251001"
    }
  };

  function buildWorkflow(config) {
    const shared = SHARED;

    const academy = config.academy || {};
    const notion = config.notion || {};
    const properties = config.properties || {};
    const report = config.report || {};
    const intake = config.intake || {};

    const credentials = {
      notion: config.credentials?.notion || {},
      github: shared.github?.credential || config.credentials?.github || {},
      anthropic: shared.anthropic?.credential || config.credentials?.anthropic || {}
    };
    const github = shared.github || config.github || {};
    const prop = properties;

    // 동적 필드 모드 감지
    const dynamicFields = prop.classLog?.fields || null;
    // dynamicFields가 있으면: [{name, type, role}] 형태
    // role: 'studentName' | 'date' | 'data'

    // 조회 모드
    const queryMode = notion.queryMode || 'relation';
    const studentRelationProp = notion.studentRelationProp || '✅학생입력';
    const portfolioStudentRelation = notion.portfolioStudentRelation || '';

    const ids = {
      trigger:         uuid(),
      dateCalc:        uuid(),
      portfolio:       uuid(),
      studentExtract:  uuid(),
      loop:            uuid(),
      classLogBodyPrep:uuid(),
      classLogQuery:   uuid(),
      dataAggregate:   uuid(),
      apiBody:         uuid(),
      claudeCall:      uuid(),
      htmlGen:         uuid(),
      githubCheck:     uuid(),
      githubBody:      uuid(),
      githubUpload:    uuid(),
      done:            uuid(),
      pageIdCheck:     uuid(),
      notionUpdate:    uuid(),
    };

    function buildDateCalcCode() {
      return `// 날짜 계산: 지난 달 1일~말일
const now = new Date();
const thisYear = now.getFullYear();
const thisMonth = now.getMonth() + 1;

let lastYear = thisYear;
let lastMonth = thisMonth - 1;
if (lastMonth === 0) { lastMonth = 12; lastYear = thisYear - 1; }

const pad = n => String(n).padStart(2, '0');
const lastDayOfLastMonth = new Date(lastYear, lastMonth, 0).getDate();

const lastMonthStart = \`\${lastYear}-\${pad(lastMonth)}-01\`;
const lastMonthEnd   = \`\${lastYear}-\${pad(lastMonth)}-\${pad(lastDayOfLastMonth)}\`;
const classPeriod    = \`\${lastYear}년 \${pad(lastMonth)}월\`;
const reportPeriod   = \`\${thisYear}년 \${pad(thisMonth)}월\`;

return { json: { lastMonthStart, lastMonthEnd, reportPeriod, classPeriod, lastYear, lastMonth, thisYear, thisMonth } };`;
    }

    // ═══════════════════════════════════════════════════════
    // v4 파이프라인: 3개 핵심 함수
    // ═══════════════════════════════════════════════════════

    function buildStudentExtractCode() {
      const nameField = prop.portfolio.name;

      // Build the relation extraction code based on config
      let relationCode = '';
      if (queryMode === 'relation') {
        if (portfolioStudentRelation) {
          relationCode = `var relProp = findProp(props, ${JSON.stringify(portfolioStudentRelation)});
  if (relProp && relProp.type === 'relation' && relProp.relation && relProp.relation.length > 0) {
    student_list_page_id = relProp.relation[0].id || '';
  }`;
        } else {
          // Auto-find first relation field
          relationCode = `for (var rk in props) {
    if (props[rk].type === 'relation' && props[rk].relation && props[rk].relation.length > 0) {
      student_list_page_id = props[rk].relation[0].id || '';
      break;
    }
  }`;
        }
      }

      const code = `// 학생 목록 추출 (v4)
const dateInfo = $('날짜 계산').first().json;
var students = [];

// getVal: Notion 속성값 추출
function getVal(prop) {
  if (!prop) return '';
  var t = prop.type;
  if (t === 'title') return (prop.title && prop.title[0]) ? prop.title[0].plain_text : '';
  if (t === 'rich_text') return (prop.rich_text && prop.rich_text[0]) ? prop.rich_text[0].plain_text : '';
  if (t === 'select') return prop.select ? (prop.select.name || '') : '';
  if (t === 'formula') {
    var f = prop.formula;
    if (!f) return '';
    if (f.type === 'string') return f.string || '';
    if (typeof f.string !== 'undefined') return f.string || '';
    if (f.type === 'number') return f.number != null ? String(f.number) : '';
    if (f.type === 'date') return f.date ? (f.date.start || '') : '';
    return '';
  }
  if (t === 'date') return prop.date ? (prop.date.start || '') : '';
  if (t === 'status') return prop.status ? (prop.status.name || '') : '';
  return '';
}

function stripEmoji(s) { return (s || '').replace(/[\\u{1F000}-\\u{1FFFF}]/gu, '').replace(/[\\uFE0F\\u200D]/g, '').trim(); }

function findProp(props, target) {
  if (props[target]) return props[target];
  var stripped = stripEmoji(target);
  for (var key in props) {
    if (stripEmoji(key) === stripped) return props[key];
    if (stripEmoji(key).indexOf(stripped) !== -1) return props[key];
  }
  return null;
}

function looksLikeDate(s) {
  if (!s) return true;
  if (s.length > 20) return true;
  if (/^\\d{4}[-\\/]/.test(s)) return true;
  if (/^[0-9a-f]{8}-/.test(s)) return true;
  return false;
}

for (var i = 0; i < items.length; i++) {
  var props = items[i].json.properties;
  if (!props) continue;

  // (준)생성 체크
  var readyProp = findProp(props, ${JSON.stringify(prop.portfolio.readyCheckbox)});
  if (readyProp && readyProp.checkbox === false) continue;
  // (완)생성 체크
  var doneProp = findProp(props, ${JSON.stringify(prop.portfolio.doneCheckbox)});
  if (doneProp && doneProp.checkbox === true) continue;

  // 이름 추출
  var name = '';
  var nameProp = findProp(props, ${JSON.stringify(nameField)});
  if (nameProp && nameProp.type !== 'relation') name = getVal(nameProp);
  if (!name || looksLikeDate(name)) {
    // formula > rich_text > title 순으로 이름 필드 탐색
    var nameEntries = [];
    for (var key in props) {
      if (stripEmoji(key).indexOf('이름') !== -1 || key.indexOf('name') !== -1) {
        if (props[key].type !== 'relation') nameEntries.push([key, props[key]]);
      }
    }
    nameEntries.sort(function(a,b) {
      var order = {formula:0, rich_text:1, title:2};
      return (order[a[1].type]||9) - (order[b[1].type]||9);
    });
    for (var j = 0; j < nameEntries.length; j++) {
      var v = getVal(nameEntries[j][1]);
      if (v && !looksLikeDate(v)) { name = v; break; }
    }
  }
  if (!name || looksLikeDate(name)) {
    for (var key2 in props) {
      if (props[key2].type === 'title' && props[key2].title && props[key2].title[0]) {
        var t = props[key2].title[0].plain_text;
        if (t && !looksLikeDate(t.trim())) { name = t.trim(); break; }
      }
    }
  }
  name = (name || '').trim().replace(/\\s+/g, ' ');
  if (!name || looksLikeDate(name)) continue;

  // student_list page_id 추출 (relation 모드용)
  var student_list_page_id = '';
  ${relationCode}

  students.push({
    json: {
      student_name: name,
      portfolio_page_id: items[i].json.id || '',
      student_list_page_id: student_list_page_id,
      reportPeriod: dateInfo.reportPeriod,
      classPeriod: dateInfo.classPeriod,
      lastMonthStart: dateInfo.lastMonthStart,
      lastMonthEnd: dateInfo.lastMonthEnd
    }
  });
}

console.log('대상 학생 ' + students.length + '명: ' + students.map(function(s){return s.json.student_name;}).join(', '));
if (students.length === 0) {
  console.log('⚠️ 학생 추출 실패!');
  if (items[0] && items[0].json && items[0].json.properties) {
    console.log('속성:', Object.keys(items[0].json.properties).join(', '));
  }
  return [{ json: { _empty: true, error: '대상 학생이 없습니다' } }];
}
return students;`;

      return code;
    }

    function buildClassLogBodyPrepCode() {
      const dateFieldName = dynamicFields ? (dynamicFields.find(function(f) { return f.role === 'date'; })?.name || '날짜') : (prop.classLog?.date?.[0] || '날짜');

      // relation mode: filter by student_list_page_id
      // name mode: no filter (get all, filter in JS later)
      if (queryMode === 'relation') {
        return `// 수업일지 조회 Body 준비 (relation 모드)
var s = $input.item.json;
var body = { page_size: 100 };

if (s.student_list_page_id) {
  body.filter = {
    property: ${JSON.stringify(studentRelationProp)},
    relation: { contains: s.student_list_page_id }
  };
}

return { json: {
  requestBody: JSON.stringify(body),
  student_name: s.student_name,
  portfolio_page_id: s.portfolio_page_id,
  student_list_page_id: s.student_list_page_id,
  reportPeriod: s.reportPeriod,
  classPeriod: s.classPeriod,
  lastMonthStart: s.lastMonthStart,
  lastMonthEnd: s.lastMonthEnd
} };`;
      } else {
        // name mode
        return `// 수업일지 조회 Body 준비 (이름 모드)
var s = $input.item.json;
var body = { page_size: 100 };
return { json: {
  requestBody: JSON.stringify(body),
  student_name: s.student_name,
  portfolio_page_id: s.portfolio_page_id,
  student_list_page_id: '',
  reportPeriod: s.reportPeriod,
  classPeriod: s.classPeriod,
  lastMonthStart: s.lastMonthStart,
  lastMonthEnd: s.lastMonthEnd
} };`;
      }
    }

    function buildDataAggregateCode() {
      const dataFields = dynamicFields ? dynamicFields.filter(function(f) { return f.role === 'data'; }) : [];
      const dateFieldName = dynamicFields ? (dynamicFields.find(function(f) { return f.role === 'date'; })?.name || '날짜') : '날짜';
      const nameFieldName = dynamicFields ? (dynamicFields.find(function(f) { return f.role === 'studentName'; })?.name || 'F이름') : 'F이름';

      // Build field extraction lines
      const fieldExtractLines = dataFields.map(function(f) {
        return `  logEntry[${JSON.stringify(f.name)}] = getVal(props[${JSON.stringify(f.name)}]);`;
      }).join('\n');

      const fieldNamesArr = JSON.stringify(dataFields.map(function(f) { return f.name; }));

      // Build name filter code
      let nameFilterCode = '';
      if (queryMode !== 'relation') {
        nameFilterCode = `
  // 이름 매칭 (이름 모드)
  var rawName = '';
  // formula > rich_text > title 순으로 이름 탐색
  var nameEntries = [];
  for (var nk in props) {
    var sk = nk.replace(/[\\u{1F000}-\\u{1FFFF}]/gu, '').replace(/[\\uFE0F\\u200D]/g, '').trim();
    if (sk.indexOf('이름') !== -1 || nk.indexOf('name') !== -1) {
      if (props[nk].type !== 'relation') nameEntries.push(props[nk]);
    }
  }
  nameEntries.sort(function(a,b) {
    var order = {formula:0, rich_text:1, title:2};
    return (order[a.type]||9) - (order[b.type]||9);
  });
  for (var ni = 0; ni < nameEntries.length; ni++) {
    var nv = getVal(nameEntries[ni]);
    if (nv && nv.trim().length > 0 && nv.length < 20) { rawName = nv.trim(); break; }
  }
  if (!rawName) continue;
  var normalized = rawName.replace(/\\s+/g, '');
  var target = prev.student_name.replace(/\\s+/g, '');
  if (normalized !== target && normalized.indexOf(target) === -1 && target.indexOf(normalized) === -1) continue;`;
      }

      return `// 데이터 집계 (v4: 단일 학생의 수업일지 처리)
var prev = $('수업일지 Body 준비').item.json;
var input = $input.first().json;
var pages = input.results || [];

function getVal(prop) {
  if (!prop) return '';
  var t = prop.type;
  if (t === 'title') return (prop.title && prop.title[0]) ? prop.title[0].plain_text : '';
  if (t === 'rich_text') return (prop.rich_text && prop.rich_text[0]) ? prop.rich_text[0].plain_text : '';
  if (t === 'select') return prop.select ? (prop.select.name || '') : '';
  if (t === 'multi_select') return (prop.multi_select || []).map(function(s){ return s.name; }).join(', ');
  if (t === 'date') return prop.date ? (prop.date.start || '') : '';
  if (t === 'number') return prop.number != null ? String(prop.number) : '';
  if (t === 'checkbox') return prop.checkbox ? 'Y' : 'N';
  if (t === 'status') return prop.status ? (prop.status.name || '') : '';
  if (t === 'url') return prop.url || '';
  if (t === 'email') return prop.email || '';
  if (t === 'phone_number') return prop.phone_number || '';
  if (t === 'created_time') return (prop.created_time || '').split('T')[0];
  if (t === 'formula') {
    var f = prop.formula;
    if (!f) return '';
    if (f.type === 'string') return f.string || '';
    if (f.type === 'number') return f.number != null ? String(f.number) : '';
    if (f.type === 'date') return f.date ? (f.date.start || '') : '';
    if (f.type === 'boolean') return f.boolean ? 'Y' : 'N';
    if (typeof f.string !== 'undefined') return f.string || '';
    return '';
  }
  if (t === 'rollup') {
    var arr = prop.rollup ? prop.rollup.array : null;
    if (!arr || arr.length === 0) return '';
    return arr.map(function(item) {
      if (item.type === 'title' && item.title && item.title[0]) return item.title[0].plain_text;
      if (item.type === 'rich_text' && item.rich_text && item.rich_text[0]) return item.rich_text[0].plain_text;
      if (item.type === 'select' && item.select) return item.select.name;
      if (item.type === 'formula' && item.formula) return item.formula.string || '';
      return '';
    }).filter(Boolean).join(', ');
  }
  return '';
}

// 날짜 추출
function findDate(props, createdTime) {
  // 지정된 날짜 필드
  var dp = props[${JSON.stringify(dateFieldName)}];
  if (dp) {
    if (dp.date && dp.date.start) return dp.date.start;
    if (dp.type === 'formula' && dp.formula) {
      if (dp.formula.type === 'date' && dp.formula.date) return dp.formula.date.start || '';
      if (dp.formula.type === 'string' && dp.formula.string) {
        var m = dp.formula.string.match(/\\d{4}-\\d{2}-\\d{2}/);
        if (m) return m[0];
      }
    }
    var dv = getVal(dp);
    if (dv) {
      var dm = dv.match(/\\d{4}-\\d{2}-\\d{2}/);
      if (dm) return dm[0];
    }
  }
  // date 타입 필드 자동 탐색
  for (var key in props) {
    if (props[key].type === 'date' && props[key].date && props[key].date.start) {
      return props[key].date.start;
    }
  }
  return (createdTime || '').split('T')[0];
}

// 날짜 범위 체크 (느슨: 못 찾으면 포함)
function inRange(dateStr) {
  var start = prev.lastMonthStart;
  var end = prev.lastMonthEnd;
  if (!dateStr || !start || !end) return true;
  var d = dateStr.slice(0, 10);
  if (d.length < 10) return true;
  return d >= start && d <= end;
}

var logs = [];
var total = 0, inrange = 0, outrange = 0;

for (var i = 0; i < pages.length; i++) {
  var page = pages[i];
  var props = page.properties || {};
  total++;

  // 이름 모드: 학생 이름 매칭 (relation 모드에서는 이미 필터됨)
  ${nameFilterCode}

  var logDate = findDate(props, page.created_time);
  if (!inRange(logDate)) { outrange++; continue; }
  inrange++;

  var logEntry = { date: logDate };
${fieldExtractLines}
  logs.push(logEntry);
}

console.log(prev.student_name + ': 총 ' + total + '건, 기간내 ' + inrange + ', 기간외 ' + outrange + ', logs ' + logs.length + '건');

logs.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });

return { json: {
  student_name: prev.student_name,
  reportPeriod: prev.reportPeriod,
  classPeriod: prev.classPeriod,
  page_id: prev.portfolio_page_id,
  logs: logs,
  fieldNames: ${fieldNamesArr}
} };`;
    }

    function buildApiBodyCode() {
      const modelId = shared.anthropic?.defaultModel || report.model || 'claude-haiku-4-5-20251001';
      const sections = report.sections || {};

      const styleMap = { simple: '심플하고 직관적인', friendly: '친근하고 격려하는', professional: '전문적이고 객관적인' };
      const honorificMap = { formal: '격식체(~합니다)', polite: '친근한 존댓말(~해요)', casual: '반말(~해)' };
      const targetMap = { parent: '학부모', student: '학생', both: '학부모+학생 통합' };
      const feedbackMap = { positive: '긍정적인 내용 중심으로 (8:2)', balanced: '긍정과 개선점을 균형있게 (6:4)', improvement: '개선점과 발전방향 중심으로 (4:6)' };
      const dataStyleMap = { numeric: '구체적 수치와 통계 중심으로', balanced: '수치와 해석을 균형있게', interpret: '의미 해석과 설명 중심으로' };

      const writingDirective = `
⚠️ 문체/톤 규칙:
- 문체: ${styleMap[intake.writingStyle] || '친근하고 격려하는'} 어조
- 존댓말: ${honorificMap[intake.honorific] || '친근한 존댓말(~해요)'}
- 대상: ${targetMap[intake.target] || '학부모'} 대상으로 작성
- 피드백: ${feedbackMap[intake.feedbackRatio] || '긍정과 개선점을 균형있게 (6:4)'}
- 데이터: ${dataStyleMap[intake.dataStyle] || '수치와 해석을 균형있게'}
`.trim();

      const examResultsJson = sections.examResults !== false ? `
  "exam_results": [
    {
      "name": "모의고사명 (예: 25년 고1 3월 모의고사)",
      "score": "점수 (예: 88점, 점수 없으면 빈 문자열)",
      "grade": "등급 (예: 1등급)",
      "comment": "틀린 문제 유형 등 간략한 코멘트"
    }
  ],` : '';

      const roadmapJson = sections.roadmap !== false ? `
  "roadmap": [
    { "status": "done or now or next", "title": "단계명", "desc": "설명", "badge_type": "green or blue or gray" }
  ],` : '';

      const donutJson = sections.donut !== false ? `
  "donut": [
    { "label": "과정명", "count": 숫자, "color": "accent1 or accent2 or accent3 or accent4" }
  ],` : '';

      const abilityJson = sections.ability !== false ? `
  "ability": [
    { "name": "능력항목", "score": 숫자(0-100), "color": "blue or green or orange" }
  ],` : '';

      const noticesJson = sections.notices !== false ? `
  "notices": [
    { "dot": "blue or green or orange or red", "text": "공지사항 내용. <strong>강조</strong> 사용 가능." }
  ],` : '';

      const scheduleJson = sections.schedule !== false ? `
  "schedule": [
    { "day": "월요일", "time": "17:00 등원" }
  ]` : '';

      // 동적 필드용 로그 텍스트 생성 코드
      let logsTextCode, absentCode, courseSetCode;

      if (dynamicFields) {
        const dataFields = dynamicFields.filter(f => f.role === 'data');
        const fieldListStr = dataFields.map(f => JSON.stringify(f.name)).join(', ');

        logsTextCode = `const fieldNames = s.fieldNames || [${fieldListStr}];
const logsText = logs.length > 0
  ? logs.map((l, i) => {
      const parts = [\`[\${i+1}] 날짜:\${l.date||'미정'}\`];
      for (const fn of fieldNames) {
        if (l[fn] !== undefined && l[fn] !== '') parts.push(\`\${fn}:\${l[fn]}\`);
      }
      return parts.join('\\n');
    }).join('\\n')
  : '수업 기록 없음';`;

        absentCode = `// 결석 판별: 모든 필드에서 '결석' 키워드 탐색
const absentLogs = logs.filter(l => {
  const allText = Object.values(l).join(' ');
  return allText.includes('결석');
});
const actualLessons = logs.filter(l => {
  const allText = Object.values(l).join(' ');
  return !allText.includes('결석');
});`;

        courseSetCode = `// 과정 분석: 첫 번째 데이터 필드를 과정으로 사용
const firstField = fieldNames[0] || '';
const courseSet = {};
actualLessons.forEach(l => {
  const course = l[firstField] || '기타';
  if (!courseSet[course]) courseSet[course] = { count: 0 };
  courseSet[course].count++;
});`;
      } else {
        logsTextCode = `const logsText = logs.length > 0
  ? logs.map((l, i) =>
      \`[\${i+1}] 날짜:\${l.date||'미정'} | 과정:\${l.course||'-'} | 교재:\${l.textbook||'-'} | 수업내용:\${l.content||'-'} | 과제:\${l.homework||'-'} | 특이사항:\${l.note||'-'}\`
    ).join('\\n')
  : '수업 기록 없음';`;

        absentCode = `const absentLogs    = logs.filter(l => l.course && l.course.includes('결석'));
const actualLessons = logs.filter(l => !l.course?.includes('결석'));`;

        courseSetCode = `const courseSet = {};
actualLessons.forEach(l => {
  if (l.course) {
    if (!courseSet[l.course]) courseSet[l.course] = { textbooks: new Set(), count: 0 };
    courseSet[l.course].count++;
    if (l.textbook) {
      l.textbook.split(/[,·]+/).map(t => t.trim()).filter(Boolean)
        .forEach(t => courseSet[l.course].textbooks.add(t));
    }
  }
});`;
      }

      return `// API Body 생성

const s = $input.item.json;
const classPeriod  = s.classPeriod  || '';
const reportPeriod = s.reportPeriod || '';
const logs = s.logs || [];

${logsTextCode}

${absentCode}

${courseSetCode}

const courseSummaryText = Object.entries(courseSet)
  .map(([c, v]) => v.textbooks ? \`\${c}(\${v.count}회, 교재: \${[...v.textbooks].join('/')})\` : \`\${c}(\${v.count}회)\`)
  .join(', ');

const ILLNESS_KW = ['수술','입원','병원','몸살','감기','발열','아파','코로나','격리','질병','건강','병결'];
const illnessLogs = logs.filter(l => {
  const fields = Object.values(l).join(' ');
  return ILLNESS_KW.some(kw => fields.includes(kw));
});
const hasIllnessAbsent = illnessLogs.length > 0;

const examLogs = logs.filter(l => {
  const fields = Object.values(l).join(' ');
  return fields.includes('모의고사') || fields.includes('등급') || fields.includes('모고');
});
const examText = examLogs.length > 0
  ? examLogs.map(l => {
      const parts = [\`날짜:\${l.date||'미정'}\`];
      for (const [k, v] of Object.entries(l)) {
        if (k !== 'date' && v) parts.push(\`\${k}:\${v}\`);
      }
      return parts.join(' | ');
    }).join('\\n')
  : '없음';

const apiBody = {
  model: ${JSON.stringify(modelId)},
  max_tokens: 4000,
  messages: [{
    role: 'user',
    content: \`당신은 수학 학원의 학부모 보고서 작성 전문가입니다.
아래 수업 기록을 분석해 JSON만 출력하세요.

⚠️ 중요 규칙:
- 반드시 순수 JSON만 출력할 것
- \\\`\\\`\\\`json 같은 마크다운 코드블록 절대 사용 금지
- 설명 텍스트, 주석, 전후 문장 없이 { 로 시작해서 } 로 끝낼 것

${writingDirective}

학생: \${s.student_name} / 기간: \${classPeriod}
총 수업일지: \${logs.length}건 (결석 \${absentLogs.length}건, 실수업 \${actualLessons.length}건)
진행과정: \${courseSummaryText || '정보 없음'}

⚠️ lesson_count는 반드시 실수업 횟수(\${actualLessons.length})를, absent_count는 결석 횟수(\${absentLogs.length})를 사용하세요.
stats의 출석률은 (실수업/총수업)*100으로 계산하세요. 총수업이 0이면 0%로 표시.
\${hasIllnessAbsent ? \`\\n⚠️ 병결 감지: 수술/입원 등 건강 사유 결석이 있음 (관련 기록: \${illnessLogs.map(l=>\`\${l.date} \${l.note||l.content}\`).join(' / ')})\` : ''}

=== 수업 기록 ===
\${logsText}

=== 모의고사 관련 기록 (별도 추출) ===
\${examText}

다음 JSON 구조로 응답하세요:
{
  "student_grade": "학년 및 진입 과정",
  "badge": "우수/성실/노력중 중 하나",
  "lesson_count": \${actualLessons.length},
  "absent_count": \${absentLogs.length},
  "courses": [
    {
      "name": "과정명",
      "badge_type": "고1 or 중3 or 중2 등",
      "topic": "이번달 진행 주제",
      "textbooks": ["교재명 배열"]
    }
  ],
  "stats": [
    { "label": "통계항목명", "value": "숫자 또는 텍스트", "desc": "부연설명", "color": "blue or green or orange or red" }
  ],${examResultsJson}
  "insights": [
    { "dot": "blue or green or orange or red", "text": "인사이트 내용. <strong>강조</strong> 태그 사용 가능." }
  ],
  "attention": {
    "show": true 또는 false,
    "title": "주의사항 제목",
    "text": "주의사항 본문"
  },${roadmapJson}
  "teacher_comment": "학부모님께 드리는 코멘트. 따뜻하고 전문적인 어조. 3-4문장.",
  "timeline": [
    {
      "date": "날짜",
      "type": "normal or absent or special",
      "title": "수업 제목",
      "desc": "수업 내용 설명",
      "tag": "태그명",
      "tag_type": "blue or green or orange or red"
    }
  ],${donutJson}${abilityJson}${noticesJson}${scheduleJson}
}

⚠️ attention 필드 규칙:
\${hasIllnessAbsent
  ? '- 이 학생은 건강 사유 결석이 감지되었음. 반드시 show: true로 설정할 것'
  : '- 건강 사유 결석 기록이 있으면 show: true, 없으면 show: false'
}\`
  }]
};

return { json: {
  apiBody: JSON.stringify(apiBody),
  student_name: s.student_name,
  reportPeriod,
  classPeriod,
  page_id: s.page_id,
  logs
} };`;
    }

    function buildHtmlGenCode() {
      const acName = academy.name;
      const kakaoUrl = academy.kakaoUrl || '';
      const headerGradient = (config.design && config.design.headerGradient) || academy.headerGradient || 'linear-gradient(145deg,#2d55e0 0%,#3b6ef6 55%,#5a82f8 100%)';
      const sections = report.sections || {};
      const designColors = config.design || {};
      const accent1 = designColors.accent1 || '#3b6ef6';
      const accent2 = designColors.accent2 || '#12b886';
      const accent3 = designColors.accent3 || '#f76707';
      const accent4 = designColors.accent4 || '#e64980';
      const customCss = designColors.customCss || '';

      return `// HTML 생성

const response  = $input.item.json;
const prev      = $('API Body 생성').item.json;

const studentName  = prev.student_name  || '학생';
const reportPeriod = prev.reportPeriod  || '';
const classPeriod  = prev.classPeriod   || '';
const pageId       = prev.page_id       || '';
const logs         = prev.logs          || [];

let d = {};
try {
  const raw = (response.content || []).find(b => b.type === 'text')?.text || '{}';
  const cleaned = raw.replace(/^\\\`\\\`\\\`json\\s*/i,'').replace(/^\\\`\\\`\\\`\\s*/i,'').replace(/\\\`\\\`\\\`\\s*$/i,'').trim();
  try {
    d = JSON.parse(cleaned);
  } catch (e1) {
    const m = raw.match(/\\{[\\s\\S]*\\}/);
    if (m) d = JSON.parse(m[0]);
  }
} catch(e) {
  console.log('파싱 실패:', e.message);
}

const studentGrade   = d.student_grade   || '';
const badge          = d.badge           || '성실';
const lessonCount    = d.lesson_count    ?? logs.filter(l => !l.course?.includes('결석')).length;
const absentCount    = d.absent_count    ?? logs.filter(l =>  l.course?.includes('결석')).length;
const courses        = d.courses         || [];
const stats          = d.stats           || [];
const examResults    = d.exam_results    || [];
const insights       = d.insights        || [];
const attention      = d.attention       || { show: false };
const roadmap        = d.roadmap         || [];
const teacherComment = d.teacher_comment || '이번 달도 열심히 수업에 임해주었습니다.';
const timeline       = d.timeline        || [];
const donut          = d.donut           || [];
const ability        = d.ability         || [];
const notices        = d.notices         || [];
const schedule       = d.schedule        || [];

const ILLNESS_KW = ['수술','입원','병원','몸살','감기','발열','아파','코로나','격리','질병','건강','병결'];

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function safeHtml(s) { return String(s||''); }

const colorMap = { blue:'var(--accent1)', green:'var(--accent2)', orange:'var(--accent3)', red:'var(--accent4)' };
const dotClass   = c => 'dot-'+(c||'blue');
const tagClass   = c => 'tag-'+(c||'blue');
const barClass   = c => 'eval-bar-fill '+(c||'blue');
const scoreColor = c => colorMap[c||'blue'] || 'var(--accent1)';

function parseTextbooks(raw) {
  if (!raw) return [];
  var sep = new RegExp('[,·]+');
  return Array.from(new Set(
    raw.split(sep).map(function(t){ return t.trim(); }).filter(function(t){ return t.length > 0; })
  ));
}

function buildCourses() {
  if (!courses.length) return '<div style="color:var(--text-muted);font-size:13px;padding:12px">수업 과정 정보가 없습니다.</div>';
  return courses.map(c => {
    const rawBooks = (c.textbooks||[]).reduce(function(acc, b){ return acc.concat(parseTextbooks(b)); }, []);
    const uniqueBooks = Array.from(new Set(rawBooks));
    const books = uniqueBooks.map(b => \`<span class="book-tag">\${esc(b)}</span>\`).join('');
    const badgeType = (c.badge_type||'').includes('고') ? 'badge-blue' : 'badge-green';
    return \`<div class="course-card">
  <div class="course-left">
    <div class="course-badge \${badgeType}">\${esc(c.badge_type||'')}</div>
    <div class="course-info">
      <div class="course-name">\${esc(c.name)}</div>
      <div class="course-topic">\${esc(c.topic)}</div>
    </div>
  </div>
  <div class="course-books">\${books}</div>
</div>\`;
  }).join('');
}

function buildStats() {
  if (!stats.length) return '';
  return stats.map(s => \`<div class="stat-card \${s.color||'blue'}">
  <div class="stat-label">\${esc(s.label)}</div>
  <div class="stat-value">\${esc(s.value)}</div>
  <div class="stat-desc">\${esc(s.desc)}</div>
</div>\`).join('');
}

function buildExamResults() {
  if (!examResults.length) return '';
  return examResults.map(e => {
    const scoreNum = parseInt((e.score||'').replace(/[^0-9]/g,'')) || 0;
    let cardColor = 'blue';
    if (scoreNum >= 90) cardColor = 'green';
    else if (scoreNum >= 80) cardColor = 'blue';
    else if (scoreNum >= 70) cardColor = 'orange';
    else if (scoreNum > 0)   cardColor = 'red';
    const displayValue = e.score || e.grade || '-';
    const gradeText = e.score && e.grade ? e.grade : '';
    const commentText = e.comment || '';
    const descParts = [gradeText, commentText].filter(Boolean).join(' / ');
    return \`<div class="stat-card \${cardColor}">
  <div class="stat-label">\${esc(e.name)}</div>
  <div class="stat-value">\${esc(displayValue)}</div>
  <div class="stat-desc">\${esc(descParts)}</div>
</div>\`;
  }).join('');
}

function buildInsights() {
  if (!insights.length) return '<div style="color:var(--text-muted);font-size:13px;padding:12px">분석 데이터가 없습니다.</div>';
  return insights.map(i => \`<div class="insight-card">
  <div class="insight-dot \${dotClass(i.dot)}"></div>
  <div class="insight-text">\${safeHtml(i.text)}</div>
</div>\`).join('');
}

function buildAttention() {
  if (!attention.show) return '';
  const isIllness = ILLNESS_KW.some(kw =>
    (attention.title||'').includes(kw) || (attention.text||'').includes(kw)
  );
  const cardBg    = isIllness ? '#fff0f3' : '#fff8f0';
  const cardBdr   = isIllness ? '#f87171' : '#ffd8b0';
  const titleColor= isIllness ? '#e64980' : 'var(--accent3)';
  const icon      = isIllness ? '🏥' : '⚠️';
  return \`<div class="section">
  <div class="sec-label">특이 사항</div>
  <div class="attention-card" style="background:\${cardBg};border-color:\${cardBdr}">
    <div class="attention-icon">\${icon}</div>
    <div>
      <div class="attention-title" style="color:\${titleColor}">\${esc(attention.title||'')}</div>
      <div class="attention-text">\${safeHtml(attention.text||'')}</div>
    </div>
  </div>
</div>\`;
}

function highlightIllnessText(rawText) {
  if (!rawText) return '';
  function escSeg(s) {
    // 허용 태그를 플레이스홀더로 보호 → 이스케이프 → 복원
    var safe = String(s);
    var tags = [];
    safe = safe.replace(/<(\\/?(strong|em|br|b|i))(\\s*\\/?)>/gi, function(m){ tags.push(m); return '%%TAG'+(tags.length-1)+'%%'; });
    safe = safe.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    for (var i = 0; i < tags.length; i++) { safe = safe.replace('%%TAG'+i+'%%', tags[i]); }
    return safe;
  }
  var tokens = [];
  var remain = rawText;
  var re = /([.!?。]\\s+)/;
  while (remain.length > 0) {
    var m = re.exec(remain);
    if (!m) { tokens.push(remain); break; }
    tokens.push(remain.slice(0, m.index + m[0].length));
    remain = remain.slice(m.index + m[0].length);
  }
  var result = '';
  for (var i = 0; i < tokens.length; i++) {
    var seg = tokens[i];
    var hasIllness = ILLNESS_KW.some(function(kw){ return seg.indexOf(kw) !== -1; });
    var escaped = escSeg(seg);
    if (hasIllness && seg.trim().length > 0) {
      result += '<span style="background:linear-gradient(180deg,transparent 55%,#ffd6e0 55%);font-weight:700;color:#c2185b;border-radius:2px;padding:0 2px;">' + escaped + '</span>';
    } else {
      result += escaped;
    }
  }
  return result;
}

function buildRoadmap() {
  if (!roadmap.length) return '<div style="color:var(--text-muted);font-size:13px;padding:12px">로드맵 정보가 없습니다.</div>';
  const circleClass = { done:'circle-done', now:'circle-now', next:'circle-next' };
  const circleLabel = { done:'&#10003;', now:'&#9679;', next:'&#8594;' };
  return roadmap.map(r => \`<div class="roadmap-row">
  <div class="roadmap-circle \${circleClass[r.status]||'circle-next'}">\${circleLabel[r.status]||'&#8594;'}</div>
  <div class="roadmap-info">
    <div class="roadmap-title">\${esc(r.title)}</div>
    <div class="roadmap-desc">\${esc(r.desc)}</div>
  </div>
  <span class="roadmap-badge \${tagClass(r.badge_type||'gray')}">\${r.status==='done'?'완료':r.status==='now'?'진행중':'예정'}</span>
</div>\`).join('');
}

function buildTimeline() {
  if (!timeline.length) return '<div style="color:var(--text-muted);font-size:13px;padding:12px">수업 기록이 없습니다.</div>';
  return timeline.map(t => {
    const allText = [t.title, t.desc, t.tag, t.type].join(' ');
    const isIllnessAbsent = (t.type === 'absent') &&
      ILLNESS_KW.some(kw => allText.includes(kw));
    const cardStyle = isIllnessAbsent
      ? 'background:#fff0f3;border:1.5px solid #f87171;box-shadow:0 2px 10px rgba(248,113,113,0.18);'
      : '';
    const dotStyle = isIllnessAbsent
      ? 'position:absolute;left:-22px;top:6px;width:11px;height:11px;border-radius:50%;background:#f87171;border:2px solid #e64980;'
      : '';
    const illnessBadge = isIllnessAbsent ? \`
      <div style="display:inline-flex;align-items:center;gap:5px;background:#fde9f0;border:1px solid #f9a8c9;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700;color:#e64980;margin-bottom:8px;">
        🏥 병결 (수업 미진행)
      </div>\` : '';
    const dotHtml = dotStyle ? \`<div style="\${dotStyle}"></div>\` : '';
    return \`<div class="tl-item \${t.type||'normal'}">
  \${dotHtml}
  <div class="tl-date">\${esc(t.date)}</div>
  <div class="tl-card" style="\${cardStyle}">
    \${illnessBadge}
    <div class="tl-title">\${esc(t.title)}</div>
    <div class="tl-desc">\${safeHtml(t.desc)}</div>
    <span class="tl-tag \${tagClass(t.tag_type)}">\${esc(t.tag)}</span>
  </div>
</div>\`;
  }).join('');
}

function buildDonut() {
  if (!donut.length) return '<div style="color:var(--text-muted);font-size:13px;padding:12px">분포 데이터가 없습니다.</div>';
  const total = donut.reduce((s,d)=>s+d.count,0) || 1;
  const colors = { accent1:'var(--accent1)', accent2:'var(--accent2)', accent3:'var(--accent3)', accent4:'var(--accent4)' };
  const r = 40, cx = 50, cy = 50;
  let offset = 0;
  const slices = donut.map(d => {
    const pct  = d.count / total;
    const dash = pct * 2 * Math.PI * r;
    const gap  = (1-pct) * 2 * Math.PI * r;
    const slice = \`<circle cx="\${cx}" cy="\${cy}" r="\${r}" fill="none" stroke="\${colors[d.color]||'var(--accent1)'}" stroke-width="13" stroke-dasharray="\${dash.toFixed(2)} \${gap.toFixed(2)}" stroke-dashoffset="\${(-offset*2*Math.PI*r).toFixed(2)}" transform="rotate(-90 \${cx} \${cy})"/>\`;
    offset += pct;
    return slice;
  }).join('');
  const legend = donut.map(d => \`<div class="legend-item">
  <div class="legend-dot" style="background:\${colors[d.color]||'var(--accent1)'}"></div>
  <div class="legend-name">\${esc(d.label)}</div>
  <div class="legend-val" style="color:\${colors[d.color]||'var(--accent1)'}">\${d.count}회</div>
</div>\`).join('');
  return \`<div class="donut-wrap">
  <svg width="100" height="100" viewBox="0 0 100 100" style="flex-shrink:0">
    <circle cx="\${cx}" cy="\${cy}" r="\${r}" fill="none" stroke="#eef1f8" stroke-width="13"/>
    \${slices}
    <text x="\${cx}" y="47" text-anchor="middle" fill="#1a1f36" font-size="15" font-weight="900" font-family="Noto Sans KR">\${total}</text>
    <text x="\${cx}" y="59" text-anchor="middle" fill="#9ba3b8" font-size="8" font-family="Noto Sans KR">수업</text>
  </svg>
  <div class="donut-legend">\${legend}</div>
</div>\`;
}

function buildAbility() {
  if (!ability.length) return '<div style="color:var(--text-muted);font-size:13px">능력 지표 데이터가 없습니다.</div>';
  return ability.map((a,i) => {
    const last = i === ability.length-1;
    return \`<div class="eval-item"\${last?' style="margin-bottom:0"':''}>
  <div class="eval-header">
    <span class="eval-name">\${esc(a.name)}</span>
    <span class="eval-score" style="color:\${scoreColor(a.color)}">\${a.score}%</span>
  </div>
  <div class="eval-bar-bg"><div class="\${barClass(a.color)}" style="width:\${a.score}%"></div></div>
</div>\`;
  }).join('');
}

function buildNotices() {
  if (!notices.length) return '<div style="color:var(--text-muted);font-size:13px;padding:12px">공지사항이 없습니다.</div>';
  return notices.map(n => \`<div class="insight-card">
  <div class="insight-dot \${dotClass(n.dot)}"></div>
  <div class="insight-text">\${safeHtml(n.text)}</div>
</div>\`).join('');
}

function buildSchedule() {
  if (!schedule.length) return '<div style="color:var(--text-muted);font-size:13px">시간표 정보가 없습니다.</div>';
  return schedule.map(s => \`<div class="schedule-box">
  <div style="font-size:22px">&#128197;</div>
  <div class="schedule-day">\${esc(s.day)}</div>
  <div class="schedule-time">\${esc(s.time)}</div>
</div>\`).join('');
}

const ACADEMY_NAME = ${JSON.stringify(acName)};
const KAKAO_URL = ${JSON.stringify(kakaoUrl)};
const HEADER_GRADIENT = ${JSON.stringify(headerGradient)};

const html = \`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>수학 학습 보고서 - \${esc(studentName)} \${esc(classPeriod)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:#f4f6fb; --surface:#ffffff; --surface2:#eef1f8;
    --border:rgba(0,0,0,0.07);
    --accent1:${accent1}; --accent2:${accent2}; --accent3:${accent3}; --accent4:${accent4};
    --text-primary:#1a1f36; --text-secondary:#515872; --text-muted:#9ba3b8;
    --radius:16px; --radius-sm:10px;
    --shadow:0 2px 12px rgba(0,0,0,0.055);
  }
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text-primary);min-height:100vh;-webkit-font-smoothing:antialiased}
  .wrap{max-width:480px;margin:0 auto;padding-bottom:calc(76px + env(safe-area-inset-bottom))}
  .header{padding:52px 24px 36px;position:relative;overflow:hidden;background:\${HEADER_GRADIENT}}
  .header::before{content:'';position:absolute;top:-60px;right:-60px;width:240px;height:240px;border-radius:50%;background:rgba(255,255,255,0.08)}
  .header::after{content:'';position:absolute;bottom:-40px;left:-30px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,0.05)}
  .header-label{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:14px;position:relative;z-index:1;opacity:0;animation:fadeUp .5s ease .1s forwards}
  .header-label::before{content:'';width:14px;height:2px;background:rgba(255,255,255,0.55);border-radius:2px}
  .header-name{font-size:30px;font-weight:900;line-height:1.2;color:#fff;position:relative;z-index:1;opacity:0;animation:fadeUp .5s ease .2s forwards}
  .header-name span{color:rgba(255,255,255,0.6)}
  .header-sub{font-size:13px;color:rgba(255,255,255,0.65);margin-top:8px;position:relative;z-index:1;opacity:0;animation:fadeUp .5s ease .3s forwards}
  .header-meta{position:absolute;top:52px;right:24px;text-align:right;z-index:1;opacity:0;animation:fadeIn .5s ease .4s forwards}
  .header-meta-academy{font-size:12px;font-weight:700;color:rgba(255,255,255,0.85)}
  .header-meta-date{font-size:10px;color:rgba(255,255,255,0.5);margin-top:3px}
  .section{padding:24px 20px 0;opacity:0;animation:fadeUp .5s ease forwards}
  .section:nth-child(2){animation-delay:.35s}.section:nth-child(3){animation-delay:.45s}.section:nth-child(4){animation-delay:.55s}.section:nth-child(5){animation-delay:.65s}.section:nth-child(6){animation-delay:.75s}
  .sec-label{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .sec-label::after{content:'';flex:1;height:1px;background:var(--border)}
  .id-card{background:var(--surface);border-radius:var(--radius);padding:20px;display:flex;align-items:center;gap:16px;border:1px solid var(--border);box-shadow:var(--shadow);position:relative;overflow:hidden}
  .id-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(180deg,var(--accent1),var(--accent2))}
  .id-avatar{width:54px;height:54px;background:linear-gradient(135deg,var(--accent1),#5480f8);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 4px 14px rgba(59,110,246,0.22)}
  .id-info-name{font-size:20px;font-weight:700;color:var(--text-primary)}
  .id-info-detail{font-size:12px;color:var(--text-secondary);margin-top:4px}
  .id-badge{margin-left:auto;background:#e6faf3;border:1px solid #b2eedd;color:var(--accent2);font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px;white-space:nowrap}
  .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .stat-card{background:var(--surface);border-radius:var(--radius-sm);padding:18px 16px;border:1px solid var(--border);box-shadow:var(--shadow);position:relative;overflow:hidden}
  .stat-card::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:3px 3px 0 0}
  .stat-card.blue::after{background:var(--accent1)}.stat-card.green::after{background:var(--accent2)}.stat-card.orange::after{background:var(--accent3)}.stat-card.red::after{background:var(--accent4)}
  .stat-label{font-size:11px;color:var(--text-muted);margin-bottom:8px;font-weight:500}
  .stat-value{font-size:28px;font-weight:900;line-height:1;margin-bottom:4px}
  .stat-card.blue .stat-value{color:var(--accent1)}.stat-card.green .stat-value{color:var(--accent2)}.stat-card.orange .stat-value{color:var(--accent3)}.stat-card.red .stat-value{color:var(--accent4)}
  .stat-desc{font-size:11px;color:var(--text-muted)}
  .eval-item{margin-bottom:14px}.eval-item:last-child{margin-bottom:0}
  .eval-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
  .eval-name{font-size:13px;font-weight:500;color:var(--text-primary)}
  .eval-score{font-size:13px;font-weight:700}
  .eval-bar-bg{height:7px;background:var(--surface2);border-radius:6px;overflow:hidden}
  .eval-bar-fill{height:100%;border-radius:6px;animation:growBar 1s cubic-bezier(.16,1,.3,1) .6s both}
  @keyframes growBar{from{width:0!important}}
  .eval-bar-fill.blue{background:linear-gradient(90deg,var(--accent1),#7ba3ff)}.eval-bar-fill.green{background:linear-gradient(90deg,var(--accent2),#6edfc3)}.eval-bar-fill.orange{background:linear-gradient(90deg,var(--accent3),#ffac5e)}
  .insight-list{display:flex;flex-direction:column;gap:10px}
  .insight-card{background:var(--surface);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border);box-shadow:var(--shadow);display:flex;gap:12px;align-items:flex-start}
  .insight-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:5px}
  .dot-blue{background:var(--accent1)}.dot-green{background:var(--accent2)}.dot-orange{background:var(--accent3)}.dot-red{background:var(--accent4)}
  .insight-text{font-size:13px;color:var(--text-secondary);line-height:1.75}
  .insight-text strong{color:var(--text-primary);font-weight:700}
  .tag-blue{background:#eef2fe;color:var(--accent1)}.tag-green{background:#e6faf3;color:var(--accent2)}.tag-orange{background:#fff3e8;color:var(--accent3)}.tag-red{background:#fde9f0;color:var(--accent4)}.tag-gray{background:var(--surface2);color:var(--text-muted)}
  .attention-card{border-radius:var(--radius-sm);padding:16px;display:flex;gap:12px;align-items:flex-start;border:1px solid}
  .attention-icon{font-size:20px;flex-shrink:0;margin-top:1px}
  .attention-title{font-size:12px;font-weight:700;margin-bottom:6px}
  .attention-text{font-size:13px;color:var(--text-secondary);line-height:1.75}
  .roadmap{background:var(--surface);border-radius:var(--radius);padding:20px;border:1px solid var(--border);box-shadow:var(--shadow)}
  .roadmap-row{display:flex;align-items:flex-start;gap:14px;padding:10px 0;position:relative}
  .roadmap-row:not(:last-child)::after{content:'';position:absolute;left:15px;top:36px;bottom:-10px;width:1px;background:var(--border)}
  .roadmap-circle{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700}
  .circle-done{background:var(--accent2);color:#fff}.circle-now{background:var(--accent1);color:#fff;box-shadow:0 0 0 4px rgba(59,110,246,0.12)}.circle-next{background:var(--surface2);color:var(--text-muted);border:1px solid var(--border)}
  .roadmap-info{padding-top:4px;flex:1}
  .roadmap-title{font-size:14px;font-weight:600;color:var(--text-primary);line-height:1.3}
  .roadmap-desc{font-size:12px;color:var(--text-muted);margin-top:2px}
  .roadmap-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;margin-left:auto;flex-shrink:0;margin-top:4px}
  .comment-box{background:var(--surface);border-radius:var(--radius);padding:20px;border:1px solid var(--border);border-left:4px solid var(--accent3);box-shadow:var(--shadow)}
  .comment-header{display:flex;align-items:center;gap:10px;margin-bottom:14px}
  .comment-avatar{width:32px;height:32px;background:#fff3e8;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px}
  .comment-title{font-size:13px;font-weight:700;color:var(--text-primary)}
  .comment-role{font-size:11px;color:var(--text-muted)}
  .comment-text{font-size:13px;color:var(--text-secondary);line-height:1.85}
  .timeline{position:relative;padding-left:26px}
  .timeline::before{content:'';position:absolute;left:7px;top:10px;bottom:0;width:2px;background:linear-gradient(180deg,var(--accent1),transparent);border-radius:2px}
  .tl-item{position:relative;padding-bottom:20px}
  .tl-item::before{content:'';position:absolute;left:-22px;top:6px;width:9px;height:9px;border-radius:50%;background:#fff;border:2px solid var(--text-muted)}
  .tl-item.absent::before{border-color:var(--accent4);background:#fde9f0}.tl-item.special::before{border-color:var(--accent3);background:#fff3e8}.tl-item.normal::before{border-color:var(--accent1);background:#eef2fe}
  .tl-date{font-size:10px;color:var(--text-muted);margin-bottom:5px;font-weight:500}
  .tl-card{background:var(--surface);border-radius:var(--radius-sm);padding:14px 16px;border:1px solid var(--border);box-shadow:var(--shadow)}
  .tl-title{font-size:13px;font-weight:700;color:var(--text-primary)}
  .tl-desc{font-size:12px;color:var(--text-secondary);margin-top:5px;line-height:1.65}
  .tl-tag{font-size:10px;font-weight:600;margin-top:8px;display:inline-block;padding:2px 8px;border-radius:6px}
  .donut-wrap{display:flex;align-items:center;gap:20px;background:var(--surface);border-radius:var(--radius);padding:20px;border:1px solid var(--border);box-shadow:var(--shadow)}
  .donut-legend{flex:1}
  .legend-item{display:flex;align-items:center;gap:8px;padding:5px 0}
  .legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .legend-name{font-size:12px;color:var(--text-secondary);flex:1}
  .legend-val{font-size:12px;font-weight:700;color:var(--text-primary)}
  .footer-text{font-size:12px;color:var(--text-muted);line-height:1.8;text-align:center}
  .footer-text a{color:var(--accent1);text-decoration:none;font-weight:700}
  .bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(255,255,255,0.96);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid var(--border);padding:10px 0 calc(10px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(4,1fr);z-index:100;box-shadow:0 -4px 20px rgba(0,0,0,0.06)}
  .nav-item{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;transition:opacity .2s}
  .nav-item:active{opacity:.5}
  .nav-icon{font-size:20px}
  .nav-label{font-size:9px;font-weight:500;color:var(--text-muted)}
  .nav-item.active .nav-label{color:var(--accent1);font-weight:700}
  .tab-section{display:none}.tab-section.active{display:block}
  .course-list{display:flex;flex-direction:column;gap:10px}
  .course-card{background:var(--surface);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px}
  .course-left{display:flex;align-items:center;gap:12px;width:100%}
  .course-badge{width:36px;height:36px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:-0.3px}
  .badge-blue{background:#eef2fe;color:var(--accent1)}.badge-green{background:#e6faf3;color:var(--accent2)}
  .course-info{min-width:0;flex:1}
  .course-name{font-size:15px;font-weight:700;color:var(--text-primary)}
  .course-topic{font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .course-books{display:flex;gap:6px;flex-wrap:wrap}
  .book-tag{font-size:11px;font-weight:600;padding:4px 9px;border-radius:20px;background:var(--surface2);color:var(--text-secondary);border:1px solid var(--border);white-space:nowrap}
  .schedule-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .schedule-box{background:#eef2fe;border:1px solid #c5d3fc;border-radius:var(--radius-sm);padding:16px;text-align:center}
  .schedule-day{font-size:14px;font-weight:700;color:var(--accent1);margin-top:6px}
  .schedule-time{font-size:12px;color:var(--text-secondary);margin-top:3px}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  ${customCss ? customCss : ''}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-label">Math Report · \${esc(classPeriod)}</div>
    <div class="header-name">\${esc(studentName)} <span>학습</span><br>보고서</div>
    <div class="header-sub">\${esc(classPeriod)} · \${ACADEMY_NAME}</div>
    <div class="header-meta">
      <div class="header-meta-academy">\${ACADEMY_NAME}</div>
      <div class="header-meta-date">\${esc(classPeriod)} 기준</div>
    </div>
  </div>

  <div id="tab-home" class="tab-section active">
    <div class="section">
      <div class="sec-label">학생 프로파일</div>
      <div class="id-card">
        <div class="id-avatar">&#128208;</div>
        <div>
          <div class="id-info-name">\${esc(studentName)}</div>
          <div class="id-info-detail">\${esc(studentGrade)}</div>
        </div>
        <div class="id-badge">\${esc(badge)} &#11088;</div>
      </div>
    </div>
    <div class="section">
      <div class="sec-label">진행 과정 및 교재</div>
      <div class="course-list">\${buildCourses()}</div>
    </div>
    <div class="section">
      <div class="sec-label">\${esc(classPeriod)} 수업 현황</div>
      <div class="stats-grid">\${buildStats()}</div>
    </div>
    \${examResults.length ? \`<div class="section">
      <div class="sec-label">\${esc(classPeriod)} 모의고사 현황</div>
      <div class="stats-grid">\${buildExamResults()}</div>
    </div>\` : ''}
    <div class="section">
      <div class="sec-label">이달의 학습 인사이트</div>
      <div class="insight-list">\${buildInsights()}</div>
    </div>
    \${buildAttention()}
    <div class="section">
      <div class="sec-label">학습 로드맵</div>
      <div class="roadmap">\${buildRoadmap()}</div>
    </div>
    <div class="section">
      <div class="sec-label">선생님 코멘트</div>
      <div class="comment-box">
        <div class="comment-header">
          <div class="comment-avatar">&#128221;</div>
          <div>
            <div class="comment-title">담당 선생님</div>
            <div class="comment-role">\${ACADEMY_NAME}</div>
          </div>
        </div>
        <div class="comment-text">\${highlightIllnessText(teacherComment)}</div>
      </div>
    </div>
    <div style="margin:28px 20px 0;padding:18px;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border);box-shadow:var(--shadow)">
      <div class="footer-text">
        궁금한 점은 카카오톡 채널로 문의해 주세요.<br>
        <a href="\${KAKAO_URL}">\${ACADEMY_NAME}</a> · 항상 감사합니다 &#128591;
      </div>
    </div>
    <div style="height:8px"></div>
  </div>

  <div id="tab-timeline" class="tab-section">
    <div class="section">
      <div class="sec-label">\${esc(classPeriod)} 수업 기록</div>
      <div class="timeline">\${buildTimeline()}</div>
    </div>
    <div style="height:8px"></div>
  </div>

  <div id="tab-analysis" class="tab-section">
    <div class="section">
      <div class="sec-label">수업 분포</div>
      \${buildDonut()}
    </div>
    <div class="section">
      <div class="sec-label">능력 지표</div>
      <div style="background:var(--surface);border-radius:var(--radius);padding:20px;border:1px solid var(--border);box-shadow:var(--shadow)">
        \${buildAbility()}
      </div>
    </div>
    <div style="height:8px"></div>
  </div>

  <div id="tab-notice" class="tab-section">
    <div class="section">
      <div class="sec-label">다음 달 공지사항</div>
      <div class="insight-list">\${buildNotices()}</div>
    </div>
    <div class="section">
      <div class="sec-label">예상 시간표</div>
      <div style="background:var(--surface);border-radius:var(--radius);padding:20px;border:1px solid var(--border);box-shadow:var(--shadow)">
        <div class="schedule-grid">\${buildSchedule()}</div>
        <div style="margin-top:14px;font-size:12px;color:var(--text-muted);line-height:1.8">※ 학교 마치는 시간에 따라 변동될 수 있습니다.</div>
      </div>
    </div>
    <div style="margin:28px 20px 0;padding:18px;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border);box-shadow:var(--shadow)">
      <div class="footer-text">
        문의사항은 카카오톡으로 연락주세요.<br>
        <a href="\${KAKAO_URL}">\${ACADEMY_NAME}</a> · 감사합니다 &#128591;
      </div>
    </div>
    <div style="height:8px"></div>
  </div>

  <nav class="bottom-nav">
    <div class="nav-item active" onclick="switchTab('home',this)"><div class="nav-icon">&#127968;</div><div class="nav-label">홈</div></div>
    <div class="nav-item" onclick="switchTab('timeline',this)"><div class="nav-icon">&#128203;</div><div class="nav-label">수업기록</div></div>
    <div class="nav-item" onclick="switchTab('analysis',this)"><div class="nav-icon">&#128202;</div><div class="nav-label">분석</div></div>
    <div class="nav-item" onclick="switchTab('notice',this)"><div class="nav-icon">&#128226;</div><div class="nav-label">공지</div></div>
  </nav>
</div>
<script>
function switchTab(name,el){
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  el.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}
</script>
</body>
</html>\`;

const safeStudentName = studentName.replace(/[^가-힣a-zA-Z0-9]/g, '_');
const yearMonth = String(prev.classPeriod||'').replace(/[^0-9]/g,'') || new Date().toISOString().slice(0,7).replace('-','');
const ts = Date.now();
const fileName = \`\${safeStudentName}_\${yearMonth}_\${ts}.html\`;
const filePath = \`reports/\${fileName}\`;
const base64Content = Buffer.from(html, 'utf-8').toString('base64');

return { json: {
  file_name: fileName,
  file_path: filePath,
  student_name: studentName,
  reportPeriod,
  classPeriod,
  page_id: pageId,
  html_content: html,
  html_base64: base64Content
} };`;
    }

    // ── 노드 배열 구성 (v4) ──
    const nodes = [
      { parameters: {}, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [-440, 640], id: ids.trigger, name: "When clicking 'Execute workflow'" },
      { parameters: { jsCode: buildDateCalcCode() }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [-400, 920], id: ids.dateCalc, name: '날짜 계산' },
      {
        parameters: {
          resource: 'databasePage', operation: 'getAll',
          databaseId: { __rl: true, value: notion.portfolioDbId, mode: 'id' },
          returnAll: true, simple: false, filterType: 'manual', matchType: 'allFilters',
          filters: { conditions: [
            { key: `${prop.portfolio.readyCheckbox}|checkbox`, condition: 'equals', checkboxValue: true },
            { key: `${prop.portfolio.doneCheckbox}|checkbox`, condition: 'equals', checkboxValue: false }
          ] },
          options: {}
        },
        type: 'n8n-nodes-base.notion', typeVersion: 2.2, position: [-180, 920], id: ids.portfolio, name: '포트폴리오 조회',
        credentials: { notionApi: { id: credentials.notion.id, name: credentials.notion.name } }
      },
      { parameters: { jsCode: buildStudentExtractCode() }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [40, 920], id: ids.studentExtract, name: '학생 목록 추출' },
      { parameters: { options: { reset: false } }, type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: [260, 920], id: ids.loop, name: 'Loop Over Items' },
      { parameters: { jsCode: buildClassLogBodyPrepCode() }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 920], id: ids.classLogBodyPrep, name: '수업일지 Body 준비' },
      {
        parameters: {
          method: 'POST',
          url: `https://api.notion.com/v1/databases/${notion.classLogDbId}/query`,
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'notionApi',
          sendHeaders: true,
          headerParameters: { parameters: [
            { name: 'Notion-Version', value: '2022-06-28' },
            { name: 'Content-Type', value: 'application/json' }
          ] },
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ $json.requestBody }}',
          options: {}
        },
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        position: [700, 920], id: ids.classLogQuery, name: '수업일지 조회',
        credentials: { notionApi: { id: credentials.notion.id, name: credentials.notion.name } }
      },
      { parameters: { jsCode: buildDataAggregateCode() }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [920, 920], id: ids.dataAggregate, name: '데이터 집계' },
      { parameters: { jsCode: buildApiBodyCode() }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [1140, 920], id: ids.apiBody, name: 'API Body 생성' },
      {
        parameters: {
          method: 'POST', url: 'https://api.anthropic.com/v1/messages',
          authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
          sendHeaders: true, headerParameters: { parameters: [
            { name: 'anthropic-version', value: '2023-06-01' },
            { name: 'Content-Type', value: 'application/json' }
          ] },
          sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.apiBody }}',
          options: { timeout: 120000 }
        },
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1360, 920], id: ids.claudeCall, name: 'Claude API 호출',
        credentials: { anthropicApi: { id: credentials.anthropic.id, name: credentials.anthropic.name } }
      },
      { parameters: { jsCode: buildHtmlGenCode() }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [1580, 920], id: ids.htmlGen, name: 'HTML 생성' },
      {
        parameters: {
          url: `=https://api.github.com/repos/${github.owner}/${github.repo}/contents/{{ $json.file_path }}`,
          authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
          sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github.v3+json' }] },
          options: { response: { response: { neverError: true } } }
        },
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1800, 920], id: ids.githubCheck, name: 'GitHub 파일 확인',
        alwaysOutputData: true, credentials: { githubApi: { id: credentials.github.id, name: credentials.github.name } }, continueOnFail: true
      },
      {
        parameters: {
          jsCode: `const checkResult = $input.item.json;\nconst htmlData    = $('HTML 생성').item.json;\n\nif (!htmlData?.html_base64) throw new Error('HTML 데이터 없음');\n\nconst sha = (!checkResult.message && checkResult.sha) ? checkResult.sha : null;\n\nconst body = {\n  message: \`\${sha ? 'Update' : 'Create'} report: \${htmlData.file_name}\`,\n  content: htmlData.html_base64,\n  branch: 'main'\n};\nif (sha) body.sha = sha;\n\nreturn { json: { body, file_path: htmlData.file_path, file_name: htmlData.file_name, student_name: htmlData.student_name, reportPeriod: htmlData.reportPeriod, page_id: htmlData.page_id, is_update: !!sha } };`
        },
        type: 'n8n-nodes-base.code', typeVersion: 2, position: [2020, 920], id: ids.githubBody, name: 'GitHub Body 생성'
      },
      {
        parameters: {
          method: 'PUT', url: `=https://api.github.com/repos/${github.owner}/${github.repo}/contents/{{ $json.file_path }}`,
          authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
          sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github.v3+json' }] },
          sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {}
        },
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [2240, 920], id: ids.githubUpload, name: 'GitHub 업로드',
        credentials: { githubApi: { id: credentials.github.id, name: credentials.github.name } }
      },
      {
        parameters: {
          jsCode: `const uploadResult = $input.item.json;\nconst bodyData    = $('GitHub Body 생성').item.json;\n\nconst pagesUrl   = \`https://${github.owner}.github.io/${github.repo}/\${bodyData.file_path}\`;\nconst previewUrl = \`https://htmlpreview.github.io/?https://github.com/${github.owner}/${github.repo}/blob/main/\${bodyData.file_path}\`;\n\nreturn { json: {\n  success: true,\n  student_name: bodyData.student_name,\n  file_name:    bodyData.file_name,\n  reportPeriod: bodyData.reportPeriod,\n  page_id:      bodyData.page_id,\n  report_url:   previewUrl,\n  pages_url:    pagesUrl\n} };`
        },
        type: 'n8n-nodes-base.code', typeVersion: 2, position: [2460, 920], id: ids.done, name: '완료'
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [
              {
                id: 'page-id-check',
                leftValue: '={{ $json.page_id }}',
                rightValue: '',
                operator: { type: 'string', operation: 'notEmpty' }
              }
            ],
            combinator: 'and'
          },
          options: {}
        },
        type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [2680, 920], id: ids.pageIdCheck, name: 'page_id 확인'
      },
      {
        parameters: {
          resource: 'databasePage', operation: 'update',
          pageId: { __rl: true, mode: 'id', value: '={{ $json.page_id }}' },
          propertiesUi: { propertyValues: [
            { key: `${prop.portfolio.doneCheckbox}|checkbox`, checkboxValue: true },
            { key: `${prop.portfolio.readyCheckbox}|checkbox`, checkboxValue: false },
            { key: `${prop.portfolio.urlField}|url`, urlValue: '={{ $json.pages_url }}' }
          ] },
          options: {}
        },
        type: 'n8n-nodes-base.notion', typeVersion: 2.2, position: [2900, 840], id: ids.notionUpdate, name: 'Notion 업데이트',
        credentials: { notionApi: { id: credentials.notion.id, name: credentials.notion.name } }
      }
    ];

    const connections = {
      "When clicking 'Execute workflow'": { main: [[{ node: '날짜 계산', type: 'main', index: 0 }]] },
      '날짜 계산':      { main: [[{ node: '포트폴리오 조회', type: 'main', index: 0 }]] },
      '포트폴리오 조회': { main: [[{ node: '학생 목록 추출', type: 'main', index: 0 }]] },
      '학생 목록 추출':  { main: [[{ node: 'Loop Over Items', type: 'main', index: 0 }]] },
      'Loop Over Items': { main: [[], [{ node: '수업일지 Body 준비', type: 'main', index: 0 }]] },
      '수업일지 Body 준비': { main: [[{ node: '수업일지 조회', type: 'main', index: 0 }]] },
      '수업일지 조회':   { main: [[{ node: '데이터 집계', type: 'main', index: 0 }]] },
      '데이터 집계':     { main: [[{ node: 'API Body 생성', type: 'main', index: 0 }]] },
      'API Body 생성':   { main: [[{ node: 'Claude API 호출', type: 'main', index: 0 }]] },
      'Claude API 호출': { main: [[{ node: 'HTML 생성', type: 'main', index: 0 }]] },
      'HTML 생성':      { main: [[{ node: 'GitHub 파일 확인', type: 'main', index: 0 }]] },
      'GitHub 파일 확인': { main: [[{ node: 'GitHub Body 생성', type: 'main', index: 0 }]] },
      'GitHub Body 생성': { main: [[{ node: 'GitHub 업로드', type: 'main', index: 0 }]] },
      'GitHub 업로드':   { main: [[{ node: '완료', type: 'main', index: 0 }]] },
      '완료':           { main: [[{ node: 'page_id 확인', type: 'main', index: 0 }]] },
      'page_id 확인':   { main: [
        [{ node: 'Notion 업데이트', type: 'main', index: 0 }],
        [{ node: 'Loop Over Items', type: 'main', index: 0 }]
      ] },
      'Notion 업데이트': { main: [[{ node: 'Loop Over Items', type: 'main', index: 0 }]] }
    };

    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const instanceId = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');

    return { nodes, connections, pinData: {}, meta: { instanceId } };
  }

  window.buildWorkflow = buildWorkflow;
})();
