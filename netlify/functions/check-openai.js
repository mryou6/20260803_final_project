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

  if (!apiKey) {
    return response(500, {
      success: false,
      message: 'OpenAI API 환경변수가 설정되지 않았습니다.',
    })
  }

  try {
    const client = new OpenAI({
      apiKey,
      maxRetries: 0,
      timeout: 10000,
    })

    await client.models.list()

    return response(200, {
      success: true,
      message: 'OpenAI API 연결이 확인되었습니다.',
    })
  } catch (error) {
    console.error('OpenAI connection check failed.', {
      name: error?.name,
      status: error?.status,
      code: error?.code,
    })

    return response(500, {
      success: false,
      errorCode: error?.status === 401 ? 'OPENAI_AUTH_ERROR' : error?.status === 429 ? 'OPENAI_RATE_LIMIT' : 'OPENAI_CHECK_FAILED',
      message: 'OpenAI API 연결을 확인하지 못했습니다.',
    })
  }
}
