export async function POST(req: Request) {
  const body = await req.text()
  console.log(`[client-error] ${body.slice(0, 2000)}`)
  return new Response(null, { status: 204 })
}
