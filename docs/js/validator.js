/**
 * 워크플로우 JSON 유효성 검증 및 자동 수정 (브라우저용)
 */

(function() {
  const REQUIRED_NODE_NAMES = [
    '날짜 계산', '포트폴리오 조회', '학생 이름 추출', '수업일지 조회',
    '이름 매칭', 'Loop Over Items', 'API Body 생성', 'Claude API 호출',
    'HTML 생성', 'GitHub 파일 확인', 'GitHub Body 생성', 'GitHub 업로드',
    '완료', 'Notion 업데이트'
  ];

  class ValidationError {
    constructor(level, node, message, autoFixable = false) {
      this.level = level;
      this.node = node;
      this.message = message;
      this.autoFixable = autoFixable;
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

    const creds = ['notion'];
    for (const c of creds) {
      if (!config.credentials[c]?.id) {
        errors.push(new ValidationError('error', null, `credentials.${c}.id가 비어있습니다.`));
      }
      if (!config.credentials[c]?.name) {
        errors.push(new ValidationError('warning', null, `credentials.${c}.name이 비어있습니다. 기본값으로 대체됩니다.`, true));
      }
    }

    if (!config.notion.portfolioDbId || config.notion.portfolioDbId.includes('xxxx')) {
      errors.push(new ValidationError('error', null, 'notion.portfolioDbId가 설정되지 않았습니다.'));
    }
    if (!config.notion.classLogDbId || config.notion.classLogDbId.includes('xxxx')) {
      errors.push(new ValidationError('error', null, 'notion.classLogDbId가 설정되지 않았습니다.'));
    }

    const props = config.properties;
    if (!props.portfolio?.name) {
      errors.push(new ValidationError('error', null, 'properties.portfolio.name이 비어있습니다.'));
    }
    if (!props.classLog?.studentName?.length) {
      errors.push(new ValidationError('error', null, 'properties.classLog.studentName이 비어있습니다.'));
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

    const nodeNames = workflow.nodes.map(n => n.name);
    const duplicates = nodeNames.filter((n, i) => nodeNames.indexOf(n) !== i);
    if (duplicates.length > 0) {
      errors.push(new ValidationError('error', null, `중복 노드 이름: ${duplicates.join(', ')}`));
    }

    for (const name of REQUIRED_NODE_NAMES) {
      if (!nodeNames.includes(name)) {
        errors.push(new ValidationError('error', null, `필수 노드 '${name}'이(가) 없습니다.`));
      }
    }

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
            errors.push(new ValidationError('error', node.name, `${credType} credential id가 비어있습니다.`));
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
        fixes.push(`[${node.name}] id 자동 생성: ${node.id}`);
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
    }
    return fixes;
  }

  window.validateConfig = validateConfig;
  window.validateWorkflow = validateWorkflow;
  window.autoFix = autoFix;
})();
