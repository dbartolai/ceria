import { createServer } from "node:http";

export async function startAiFixture() {
  const requests = [];
  const fixture = { requests, mode: "success" };
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const input = JSON.parse(text);
    requests.push(input);
    response.setHeader("Content-Type", "application/json");
    if (fixture.mode === "quota") {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: { message: "Fixture quota reached", type: "insufficient_quota", code: "insufficient_quota" } }));
      return;
    }
    const preparation = input.text?.format?.name === "session_preparation";
    const output = preparation ? {
      summary: "Start with exponent rules, then check logarithm domain restrictions.",
      topics: [{ topic: "Logarithm equations", source: "worksheet.txt, question 14c", check: "Ask the student to solve a log equation and explain its domain." }],
    } : {
      title: "Focused logarithm practice", summary: "Practise domain checks before solving equations.",
      items: [{ title: "Check logarithm domains", details: "Complete questions 14c and 14f. Explain why each solution is allowed.", source: "worksheet.txt, question 14", estimated_minutes: 15 }],
    };
    response.end(JSON.stringify({ id: "resp_fixture", object: "response", created_at: Math.floor(Date.now()/1000), status: "completed",
      model: input.model, output: [{ id: "msg_fixture", type: "message", status: "completed", role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }, error: null, incomplete_details: null }));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(55325, "127.0.0.1", resolve); });
  fixture.close = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return fixture;
}
