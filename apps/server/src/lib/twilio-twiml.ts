function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function greetingTwiml(ngrokDomain: string): string {
  const streamUrl = `wss://${withoutTrailingSlash(ngrokDomain)}/media-stream`

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="kn-IN">Namaskara. Naanu Alisu. Nimma vishaya heLi.</Say>
  <Connect>
    <Stream url="${xmlEscape(streamUrl)}" />
  </Connect>
</Response>`
}

export function verifyTwiml(
  audioUrl: string,
  publicUrl: string,
  callSid: string,
  langCode: string
): string {
  const actionUrl = `${withoutTrailingSlash(publicUrl)}/handle-confirm?callSid=${encodeURIComponent(callSid)}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${xmlEscape(audioUrl)}</Play>
  <Gather input="speech" timeout="6" speechTimeout="3" action="${xmlEscape(actionUrl)}" method="POST" language="${xmlEscape(langCode)}" />
  <Redirect>${xmlEscape(`${actionUrl}&timeout=true`)}</Redirect>
</Response>`
}

export function transferTwiml(conferenceName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference>${xmlEscape(conferenceName)}</Conference>
  </Dial>
</Response>`
}
