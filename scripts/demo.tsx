import { Hono } from "npm:hono";
import type { FC } from "npm:hono/jsx";
import { DenoHttpSupervisor } from "../src/supervisor.ts";

const app = new Hono();
const sv = new DenoHttpSupervisor();

const Template: FC = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
      />
      <link
        rel="stylesheet"
        href="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/atom-one-dark.min.css"
      />
      <script src="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/highlight.min.js" />
      <script src="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/languages/shell.min.js" />
      <script>hljs.highlightAll();</script>
    </head>
    <body>
      <main class="container">
        {children}
      </main>
    </body>
  </html>
);

const PromptForm: FC = ({ input }: { input?: string }) => {
  return (
    <form action="/create" method="post">
      <textarea
        name="prompt"
        rows={4}
        cols={50}
        placeholder="Enter your text here..."
      >
        {input}
      </textarea>
      <button type="submit">Create</button>
    </form>
  );
};

app.get("/", (c) => {
  return c.html(
    <Template>
      <>
        <h1>Hello World</h1>
      </>
    </Template>,
  );
});

app.post("/create", async (c) => {
  const formData = await c.req.formData();
  const prompt = formData.get("prompt");
  const cookie = c.req.header("Cookie");
  let id = "";
  if (cookie && cookie.includes("id=")) {
    id = cookie.split("id=")[1];
  } else {
    id = crypto.randomUUID();
    c.header("Set-Cookie", `id=${id}`);
  }
  if (prompt) {
    await sv.load(
      id,
      prompt as string,
    );
  }
  return c.html(
    <Template>
      <iframe src={`${sv.url}/${id}`} />
      <PromptForm input={prompt} />
    </Template>,
  );
});

app.get("/create", (c) => {
  return c.html(
    <Template>
      <PromptForm />
    </Template>,
  );
});

export default app;
