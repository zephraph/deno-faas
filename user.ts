const response = await fetch("http://localhost:8000/run", {
  method: "POST",
  headers: {
    "Content-Type": "text/event-stream",
  },
  body: JSON.stringify({
    name: "test",
    script: `
      import { randomPokemon } from "jsr:@abazatte/pokemon"
      console.log(randomPokemon())
    `,
  }),
});
const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
while (true) {
  const { value, done } = await reader!.read();
  console.log("Received", value);
  if (done) break;
}
