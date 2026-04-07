/**
 * 워크플로우 JSON 유효성 검증 및 자동 수정 (브라우저용)
 * 실전 에러 패턴 6가지 포함
 */

(function() {
  const REQUIRED_NODE_NAMES = [
    '날짜 계산', '포트폴리오 조회', '학생 목록 추출', '수업일지 Body 준비',
    '수업일지 조회', '데이터 집계', 'Loop Over Items', 'API Body 생성',
    'Claude API 호출', 'HTML 생성', 'GitHub 파일 확인', 'GitHub Body 생성',
    'GitHub 업로드', '완료', 'page_id 확인', 'Notion 업데이트'
  ];

  class ValidationError {
    constructor(level, node, message, autoFixable = false, pattern = null) {
      this.level = level;       // 'error' | 'warning'
      this.node = node;
      this.message = message;
      this.autoFixable = autoFixable;
      this.pattern = pattern;   // '①'~'⑥' 또는 null
    }
  }

  function validateConfig(config) {
    const errors = [];
    const requiredFields = ['academy', 'credentials', 'notion', 'properties'];
    for (const field of requiredFields) {
      if (!config[field]) {
        errors.push(new ValidationError('error', null, `설정에 '${field}' 필드가 없습니다.`));
      }
    }
    if (errors.length > 0) return errors;

    if (!config.academy.name) {
      errors.push(new ValidationError('error', null, 'academy.name (학원명)이 비어있습니다.'));
    }

    // Notion 크레덴셜
    if (!config.credentials.notion?.id) {
      errors.push(new ValidationError('error', null, 'credentials.notion.id가 비어있습니다.'));
    }
    if (!config.credentials.notion?.name) {
      errors.push(new ValidationError('warning', null, 'credentials.notion.name이 비어있습니다. 기본값으로 대체됩니다.', true));
    }

    // ① Notion DB ID 형식 검증
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hexRe  = /^[0-9a-f]{32}$/i;
    ['portfolioDbId', 'classLogDbId'].forEach(function(key) {
      const id = config.notion[key];
      if (!id || id.includes('xxxx')) {
        errors.push(new ValidationError('error', null, `notion.${key}가 설정되지 않았습니다.`, false, '①'));
      } else if (!uuidRe.test(id) && !hexRe.test(id.replace(/-/g,''))) {
        errors.push(new ValidationError('warning', null, `notion.${key}가 UUID/32자리 hex 형식이 아닙니다. 확인해주세요.`, false, '①'));
      }
    });

    // 속성 검증
    const props = config.properties;
    if (!props.portfolio?.name) {
      errors.push(new ValidationError('error', null, 'properties.portfolio.name이 비어있습니다.'));
    }
    const cl = props.classLog;
    if (cl?.fields) {
      if (!cl.fields.some(function(f) { return f.role === 'studentName'; })) {
        errors.push(new ValidationError('error', null, '수업일지 학생 이름 역할이 지정되지 않았습니다.'));
      }
    } else if (!cl?.studentName?.length) {
      errors.push(new ValidationError('error', null, 'properties.classLog.studentName이 비어있습니다.'));
    }

    // ⑥ HTML 색상: accent1이 흰색/크림색 계열이면 경고
    const accent1 = config.design?.accent1 || '';
    if (accent1) {
      const whitePatterns = [/^#f[ef][ef][ef][ef][ef]$/i, /^#fff/i, /^#fffff/i, /white/i, /cream/i];
      if (whitePatterns.some(function(p) { return p.test(accent1); })) {
        errors.push(new ValidationError('warning', null,
          `[⑥] accent1 색상(${accent1})이 너무 밝습니다. 흰 배경에서 텍스트가 안 보일 수 있습니다.`, false, '⑥'));
      }
    }

    return errors;
  }

  function validateWorkflow(workflow) {
    const errors = [];

    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push(new ValidationError('error', null, 'nodes 배열이 없습니다.'));
      return errors;
    }
    if (!workflow.connections || typeof workflow.connections !== 'object') {
      errors.push(new ValidationError('error', null, 'connections 객체가 없습니다.'));
      return errors;
    }

    const nodeNames = workflow.nodes.map(function(n) { return n.name; });

    // 중복 노드명
    const duplicates = nodeNames.filter(function(n, i) { return nodeNames.indexOf(n) !== i; });
    if (duplicates.length > 0) {
      errors.push(new ValidationError('error', null, `중복 노드 이름: ${duplicates.join(', ')}`));
    }

    // 필수 노드 존재
    for (const name of REQUIRED_NODE_NAMES) {
      if (!nodeNames.includes(name)) {
        errors.push(new ValidationError('error', null, `필수 노드 '${name}'이(가) 없습니다.`));
      }
    }

    // 노드별 검증
    for (const node of workflow.nodes) {
      if (!node.id) {
        errors.push(new ValidationError('error', node.name, 'id가 없습니다.', true));
      }
      if (!node.position || node.position.length !== 2) {
        errors.push(new ValidationError('warning', node.name, 'position이 올바르지 않습니다.', true));
      }
      if (node.credentials) {
        for (const [credType, credVal] of Object.entries(node.credentials)) {
          if (!credVal.id) {
            errors.push(new ValidationError('error', node.name, `${credType} credential id가 비어있습니다.`, false, '①'));
          }
        }
      }
      if (node.type === 'n8n-nodes-base.code') {
        const code = node.parameters?.jsCode;
        if (!code || code.trim().length === 0) {
          errors.push(new ValidationError('error', node.name, 'jsCode가 비어있습니다.'));
        }
      }
    }

    // ② 학생 이름 추출 패턴 검증
    const extractNode = workflow.nodes.find(function(n) { return n.name === '학생 목록 추출'; });
    if (extractNode) {
      const code = extractNode.parameters?.jsCode || '';
      if (!code.includes('student_name') && !code.includes('이름') && !code.includes('name')) {
        errors.push(new ValidationError('warning', '학생 목록 추출',
          '[②] 학생 이름을 추출하는 코드가 없습니다. student_name 필드 설정을 확인하세요.', false, '②'));
      }
    }

    // ③ 수업일지 Body 준비: 필터 방식 확인
    const bodyPrepNode = workflow.nodes.find(function(n) { return n.name === '수업일지 Body 준비'; });
    if (bodyPrepNode) {
      const code = bodyPrepNode.parameters?.jsCode || '';
      if (code.includes('"formula"')) {
        errors.push(new ValidationError('error', '수업일지 Body 준비',
          '[③] formula 필터는 Notion API에서 작동하지 않습니다 (404). relation 또는 rich_text 필터를 사용하세요.', false, '③'));
      }
      const hasFilter = code.includes('relation') || code.includes('rich_text') || code.includes('filter');
      if (!hasFilter) {
        errors.push(new ValidationError('warning', '수업일지 Body 준비',
          '[③] 수업일지 조회에 필터가 없습니다 (이름 모드). 전체 조회 후 JS에서 이름 매칭이 필요합니다.', false, '③'));
      }
      if (hasFilter && code.includes('relation')) {
        // relation 모드: student_list_page_id가 비어있으면 필터 안 걸림
        if (!code.includes('student_list_page_id')) {
          errors.push(new ValidationError('warning', '수업일지 Body 준비',
            '[③] relation 필터 사용 시 student_list_page_id가 있어야 합니다. 포트폴리오에서 student_list_page_id를 추출하는지 확인하세요.', false, '③'));
        }
      }
    }

    // ④ HTML 생성: Claude 응답 마크다운 제거 코드 확인
    const htmlGenNode = workflow.nodes.find(function(n) { return n.name === 'HTML 생성'; });
    if (htmlGenNode) {
      const code = htmlGenNode.parameters?.jsCode || '';
      const hasMarkdownRemoval = (code.includes('replace') && (code.includes('json') || code.includes('`'))) ||
                                  code.includes('contentText.replace') || code.includes('clean');
      if (!hasMarkdownRemoval) {
        errors.push(new ValidationError('warning', 'HTML 생성',
          '[④] Claude 응답의 마크다운 코드블록(```json) 제거 코드가 없습니다. JSON 파싱 실패 가능.', false, '④'));
      }
    }

    // ④ API Body 생성: max_tokens 검증
    const apiBodyNode = workflow.nodes.find(function(n) { return n.name === 'API Body 생성'; });
    if (apiBodyNode) {
      const code = apiBodyNode.parameters?.jsCode || '';
      const m = code.match(/max_tokens\s*:\s*(\d+)/);
      if (m && parseInt(m[1], 10) < 2000) {
        errors.push(new ValidationError('warning', 'API Body 생성',
          `[④] max_tokens=${m[1]}이 너무 작습니다. Claude 응답 잘림 위험 — 최소 2000 권장.`, true, '④'));
      }
    }

    // ⑤ Claude API 호출: retryOnFail 확인
    const claudeNode = workflow.nodes.find(function(n) { return n.name === 'Claude API 호출'; });
    if (claudeNode) {
      if (!claudeNode.retryOnFail) {
        errors.push(new ValidationError('warning', 'Claude API 호출',
          '[⑤] retryOnFail이 설정되지 않았습니다. API 529 Overload 시 재시도가 없습니다.', true, '⑤'));
      }
    }

    // 연결 검증
    for (const [sourceName, conn] of Object.entries(workflow.connections)) {
      if (!nodeNames.includes(sourceName) && sourceName !== "When clicking 'Execute workflow'") {
        errors.push(new ValidationError('error', sourceName, '연결 소스 노드가 nodes에 없습니다.'));
      }
      if (conn.main) {
        for (const outputs of conn.main) {
          if (!outputs) continue;
          for (const target of outputs) {
            if (!nodeNames.includes(target.node)) {
              errors.push(new ValidationError('error', sourceName, `연결 대상 '${target.node}'이(가) nodes에 없습니다.`));
            }
          }
        }
      }
    }

    return errors;
  }

  function autoFix(workflow) {
    const fixes = [];
    for (const node of workflow.nodes) {
      if (!node.id) {
        node.id = crypto.randomUUID();
        fixes.push(`[${node.name}] id 자동 생성`);
      }
      if (!node.position || node.position.length !== 2) {
        node.position = [0, 0];
        fixes.push(`[${node.name}] position 기본값 설정`);
      }
      if (node.credentials) {
        for (const [credType, credVal] of Object.entries(node.credentials)) {
          if (!credVal.name && credVal.id) {
            credVal.name = credType;
            fixes.push(`[${node.name}] ${credType} credential name 기본값 설정`);
          }
        }
      }
      // ⑤ Claude API 재시도 자동 설정
      if (node.name === 'Claude API 호출' && !node.retryOnFail) {
        node.retryOnFail = true;
        node.maxTries = 3;
        node.waitBetweenTries = 12000;
        fixes.push('[Claude API 호출] retryOnFail 자동 설정 (3회, 12초)');
      }
    }
    return fixes;
  }

  window.validateConfig   = validateConfig;
  window.validateWorkflow = validateWorkflow;
  window.autoFix          = autoFix;
  window.ValidationError  = ValidationError;
})();
