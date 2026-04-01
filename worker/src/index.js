/**
 * n8n Workflow Generator - Cloudflare Worker API
 * GitHub Pages 정적 사이트를 위한 API 프록시
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS 허용 origin
    const allowedOrigins = [
      env.ALLOWED_ORIGIN || 'https://jdmsys14.github.io',
      'http://localhost:3500',
      'http://127.0.0.1:3500',
    ];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // ── 라우팅 ──
      if (url.pathname === '/api/notion/detect-properties' && request.method === 'POST') {
        return await handleNotionDetect(request, corsHeaders);
      }

      if (url.pathname === '/api/revise' && request.method === 'POST') {
        return await handleRevise(request, corsHeaders);
      }

      if (url.pathname === '/api/analyze-revision' && request.method === 'POST') {
        return await handleAnalyzeRevision(request, corsHeaders);
      }

      if (url.pathname === '/api/validate' && request.method === 'POST') {
        return await handleValidate(request, corsHeaders);
      }

      if (url.pathname === '/api/fix-workflow' && request.method === 'POST') {
        return await handleFixWorkflow(request, corsHeaders);
      }

      // Health check
      if (url.pathname === '/' || url.pathname === '/health') {
        return json(200, { status: 'ok', service: 'n8n-workflow-api' }, corsHeaders);
      }

      return json(404, { error: 'Not Found' }, corsHeaders);

    } catch (e) {
      return json(500, { error: e.message }, corsHeaders);
    }
  }
};

function json(status, data, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
  });
}

// ── Notion DB 속성 자동 감지 ──
async function handleNotionDetect(request, corsHeaders) {
  const { apiKey, databaseId } = await request.json();
  if (!apiKey || !databaseId) {
    return json(400, { error: 'apiKey와 databaseId가 필요합니다' }, corsHeaders);
  }

  const dbId = databaseId.replace(/-/g, '');
  const formattedId = `${dbId.slice(0,8)}-${dbId.slice(8,12)}-${dbId.slice(12,16)}-${dbId.slice(16,20)}-${dbId.slice(20)}`;

  const resp = await fetch(`https://api.notion.com/v1/databases/${formattedId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  });

  const result = await resp.json();

  if (result.object === 'error') {
    return json(400, { error: result.message || 'Notion API 오류' }, corsHeaders);
  }

  const properties = {};
  for (const [name, prop] of Object.entries(result.properties || {})) {
    properties[name] = { type: prop.type, name, id: prop.id };
  }

  return json(200, {
    success: true,
    title: result.title?.[0]?.plain_text || '(제목 없음)',
    properties,
  }, corsHeaders);
}

// ── 보고서 수정 (Claude API 프록시) ──
async function handleRevise(request, corsHeaders) {
  const { reportUrl, instructions, apiKey } = await request.json();
  if (!reportUrl || !instructions || !apiKey) {
    return json(400, { error: 'reportUrl, instructions, apiKey가 필요합니다' }, corsHeaders);
  }

  // 1. 보고서 HTML 가져오기
  let html;
  try {
    const resp = await fetch(reportUrl, { redirect: 'follow' });
    html = await resp.text();
  } catch (e) {
    return json(400, { error: 'URL에서 HTML을 가져올 수 없습니다: ' + e.message }, corsHeaders);
  }

  if (!html || html.length < 100) {
    return json(400, { error: '유효한 HTML을 가져올 수 없습니다. URL을 확인해주세요.' }, corsHeaders);
  }

  // 2. Claude API 호출
  const apiResult = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: `당신은 학원 학습 보고서 HTML 코드를 수정하는 전문가입니다.

아래는 현재 보고서의 전체 HTML 코드입니다. 사용자의 수정 요청사항을 반영하여 수정된 전체 HTML 코드를 출력하세요.

⚠️ 중요 규칙:
- 반드시 <!DOCTYPE html>로 시작하는 전체 HTML만 출력할 것
- \`\`\`html 같은 마크다운 코드블록 절대 사용 금지
- 설명 텍스트, 주석, 전후 문장 없이 HTML 코드만 출력
- 기존 디자인 시스템(CSS 변수, 클래스명)을 유지할 것
- 수정 요청에 해당하는 부분만 변경하고 나머지는 그대로 유지

=== 현재 HTML ===
${html}

=== 수정 요청사항 ===
${instructions}`,
      }],
    }),
  });

  const apiData = await apiResult.json();

  if (apiData.error) {
    return json(400, { error: 'Claude API 오류: ' + (apiData.error.message || JSON.stringify(apiData.error)) }, corsHeaders);
  }

  let revisedHtml = (apiData.content || []).find(b => b.type === 'text')?.text || '';
  revisedHtml = revisedHtml.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  if (!revisedHtml.includes('<!DOCTYPE') && !revisedHtml.includes('<html')) {
    return json(400, { error: '수정된 HTML이 유효하지 않습니다. 다시 시도해주세요.' }, corsHeaders);
  }

  return json(200, {
    success: true,
    html: revisedHtml,
    originalHtml: html,
    usage: apiData.usage,
  }, corsHeaders);
}

// ── 수정사항 분석 → 설정 추출 ──
async function handleAnalyzeRevision(request, corsHeaders) {
  const { originalHtml, revisedHtml, currentConfig, apiKey } = await request.json();
  if (!originalHtml || !revisedHtml || !apiKey) {
    return json(400, { error: 'originalHtml, revisedHtml, apiKey가 필요합니다' }, corsHeaders);
  }

  const apiResult = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `두 HTML 보고서를 비교하여 변경된 부분을 분석하고, n8n 워크플로우 설정으로 변환하세요.

⚠️ 중요 규칙:
- 반드시 순수 JSON만 출력할 것
- \`\`\`json 같은 마크다운 코드블록 절대 사용 금지
- { 로 시작해서 } 로 끝낼 것

=== 원본 HTML (일부) ===
${originalHtml.slice(0, 6000)}

=== 수정된 HTML (일부) ===
${revisedHtml.slice(0, 6000)}

=== 현재 설정 ===
${JSON.stringify(currentConfig || {}, null, 2)}

변경사항을 분석하여 아래 JSON 구조로 응답하세요. 변경된 항목만 포함하세요:
{
  "changes": [
    { "field": "변경된 항목명", "before": "변경 전", "after": "변경 후", "description": "변경 설명" }
  ],
  "configUpdates": {
    "design": { "accent1": "", "accent2": "", "headerGradient": "", "customCss": "" },
    "academy": { "name": "", "kakaoUrl": "" },
    "intake": { "writingStyle": "", "honorific": "" }
  },
  "promptOverrides": "",
  "templateOverrides": ""
}`,
      }],
    }),
  });

  const apiData = await apiResult.json();

  if (apiData.error) {
    return json(400, { error: 'Claude API 오류: ' + (apiData.error.message || JSON.stringify(apiData.error)) }, corsHeaders);
  }

  let raw = (apiData.content || []).find(b => b.type === 'text')?.text || '{}';
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let analysis;
  try {
    analysis = JSON.parse(raw);
  } catch (e) {
    const m = raw.match(/\{[\s\S]*\}/);
    analysis = m ? JSON.parse(m[0]) : {};
  }

  return json(200, { success: true, analysis, usage: apiData.usage }, corsHeaders);
}

// ── 설정 검증 (브라우저에서도 가능하지만 API로도 제공) ──
async function handleValidate(request, corsHeaders) {
  const config = await request.json();

  const errors = [];

  // 필수 필드 검사
  if (!config.academy?.name) errors.push({ level: 'error', message: '학원명이 없습니다' });
  if (!config.credentials?.notion?.id) errors.push({ level: 'error', message: 'Notion Credential ID가 없습니다' });
  if (!config.credentials?.notion?.name) errors.push({ level: 'warning', message: 'Notion Credential 이름이 없습니다' });
  if (!config.notion?.portfolioDbId) errors.push({ level: 'error', message: '포트폴리오 DB ID가 없습니다' });
  if (!config.notion?.classLogDbId) errors.push({ level: 'error', message: '수업일지 DB ID가 없습니다' });

  // 속성 검사
  const pf = config.properties?.portfolio || {};
  if (!pf.name) errors.push({ level: 'error', message: '포트폴리오 학생이름 속성명이 없습니다' });
  if (!pf.readyCheckbox) errors.push({ level: 'error', message: '포트폴리오 준비완료 체크박스 속성명이 없습니다' });
  if (!pf.urlField) errors.push({ level: 'warning', message: '포트폴리오 URL 필드 속성명이 없습니다' });

  const cl = config.properties?.classLog || {};
  if (!cl.studentName?.length) errors.push({ level: 'error', message: '수업일지 학생이름 속성명이 없습니다' });
  if (!cl.date?.length) errors.push({ level: 'error', message: '수업일지 날짜 속성명이 없습니다' });

  return json(200, {
    valid: errors.filter(e => e.level === 'error').length === 0,
    errors,
  }, corsHeaders);
}

// ── n8n 워크플로우 코드 수정 ──
async function handleFixWorkflow(request, corsHeaders) {
  const { workflow, errorText, errorImage, apiKey } = await request.json();
  if (!workflow || !apiKey) {
    return json(400, { error: 'workflow와 apiKey가 필요합니다' }, corsHeaders);
  }
  if (!errorText && !errorImage) {
    return json(400, { error: '에러 메시지 또는 스크린샷이 필요합니다' }, corsHeaders);
  }

  const workflowStr = JSON.stringify(workflow, null, 2);

  // Claude API 메시지 구성
  const content = [];

  // 텍스트 프롬프트
  content.push({
    type: 'text',
    text: `당신은 n8n 워크플로우 JSON 수정 전문가입니다.

아래는 에러가 발생하는 n8n 워크플로우 JSON과 에러 정보입니다.
에러를 분석하고 워크플로우 JSON을 수정하여 정상 작동하도록 해주세요.

⚠️ 중요 규칙:
1. 반드시 아래 JSON 형식으로만 출력할 것
2. \`\`\`json 같은 마크다운 코드블록 절대 사용 금지
3. { 로 시작해서 } 로 끝낼 것
4. fixedWorkflow에는 수정된 전체 워크플로우 JSON을 포함할 것
5. 기존 워크플로우의 구조(connections, credentials, node 순서)를 최대한 유지할 것
6. 에러와 관련된 노드만 최소한으로 수정할 것

=== 에러 정보 ===
${errorText || '(텍스트 없음 - 아래 스크린샷 참고)'}

=== 현재 워크플로우 JSON ===
${workflowStr}

다음 JSON 구조로 응답하세요:
{
  "fixedWorkflow": { /* 수정된 전체 워크플로우 JSON */ },
  "changes": [
    { "node": "에러가 발생한 노드명", "description": "어떤 부분을 왜 수정했는지" }
  ]
}`,
  });

  // 이미지가 있으면 추가
  if (errorImage) {
    // data:image/png;base64,xxx 형태에서 base64만 추출
    const base64Match = errorImage.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (base64Match) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: `image/${base64Match[1]}`,
          data: base64Match[2],
        },
      });
    }
  }

  const apiResult = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content }],
    }),
  });

  const apiData = await apiResult.json();

  if (apiData.error) {
    return json(400, { error: 'Claude API 오류: ' + (apiData.error.message || JSON.stringify(apiData.error)) }, corsHeaders);
  }

  let raw = (apiData.content || []).find(b => b.type === 'text')?.text || '{}';
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let result;
  try {
    result = JSON.parse(raw);
  } catch (e) {
    // JSON 내에서 워크플로우 추출 시도
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { result = JSON.parse(m[0]); } catch(e2) {
        return json(500, { error: 'AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.' }, corsHeaders);
      }
    } else {
      return json(500, { error: 'AI 응답을 파싱할 수 없습니다.' }, corsHeaders);
    }
  }

  return json(200, {
    success: true,
    fixedWorkflow: result.fixedWorkflow || result,
    changes: result.changes || [],
    usage: apiData.usage,
  }, corsHeaders);
}
