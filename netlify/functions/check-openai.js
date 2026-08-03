// Netlify 서버 환경에서 OpenAI 인증 상태를 안전하게 확인합니다.
import OpenAI from 'openai'

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

const response = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
})

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return response(405, {
      success: false,
      message: '허용되지 않은 요청입니다.',
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  const hasApiKey = typeof apiKey === 'string' && apiKey.length > 0 && apiKey !== 'undefined'
  const keyLength = hasApiKey ? apiKey.length : 0
  const keyPrefix = hasApiKey ? apiKey.slice(0, 7) : ''

  console.info('[OpenAI 환경변수 진단]', {
    hasApiKey,
    keyLength,
    keyPrefix,
    functionName: 'check-openai.handler',
  })

  if (!hasApiKey) {
    return response(500, {
      success: false,
      errorCode: 'OPENAI_API_KEY_MISSING',
      message: 'OpenAI API 환경변수가 설정되지 않았습니다.',
    })
  }

  try {
    console.info('[OpenAI 서비스 초기화]', {
      hasApiKey,
      keyLength,
      keyPrefix,
      functionName: 'check-openai.handler',
    })
    const client = new OpenAI({
      apiKey,
      maxRetries: 0,
      timeout: 10000,
    })

    console.info('[OpenAI 연결 확인 시작]', {
      requestUrl: 'https://api.openai.com/v1/models',
      functionName: 'check-openai.handler',
    })
    await client.models.list()

    console.info('[OpenAI 연결 응답]', {
      requestUrl: 'https://api.openai.com/v1/models',
      responseStatus: 200,
      responseOk: true,
      functionName: 'check-openai.handler',
    })

    return response(200, {
      success: true,
      message: 'OpenAI API 연결이 확인되었습니다.',
    })
  } catch (error) {
    console.error('[OpenAI 연결 실패]', {
      requestUrl: 'https://api.openai.com/v1/models',
      responseStatus: error?.status ?? null,
      responseOk: false,
      errorName: error?.name ?? error?.code ?? 'Error',
      errorMessage: error?.message ?? 'Unknown error',
      functionName: 'check-openai.handler',
    })

    const status = Number(error?.status) || 500
    const errorCode = status === 400
      ? 'OPENAI_BAD_REQUEST'
      : status === 401
        ? 'OPENAI_AUTH_ERROR'
        : status === 403
          ? 'OPENAI_PERMISSION_ERROR'
          : status === 429
            ? 'OPENAI_RATE_LIMIT'
            : 'OPENAI_CHECK_FAILED'

    return response(status >= 400 && status < 600 ? status : 500, {
      success: false,
      errorCode,
      message: 'OpenAI API 연결을 확인하지 못했습니다.',
    })
  }
}
