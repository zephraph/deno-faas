import { Hono } from "npm:hono";
import { html } from "npm:hono/html";
import type { FC } from "npm:hono/jsx";
import { Configuration, OpenAIApi } from "npm:openai";
import { DenoHttpSupervisor } from "../src/supervisor.ts";

const configuration = new Configuration({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});
const openai = new OpenAIApi(configuration);

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
    <>
      <form
        action="/create"
        method="post"
        onsubmit="return handleSubmit(this);"
      >
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
      <script>
        {html`
      function handleSubmit(form) {
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> Creating...';
        return true;
      }
    `}
      </script>
    </>
  );
};

const Iframe = ({ id }: { id: string }) => {
  return (
    <a
      href={`view/${id}`}
      style={{
        display: "block",
        width: "100%",
        outline: "2px solid #007bff",
        padding: "5px",
        margin: "5px",
        borderRadius: "4px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ pointerEvents: "none" }}>
        <iframe src={`${sv.url}/${id}`} style={{ width: "100%" }} />
      </div>
    </a>
  );
};

app.get("/", (c) => {
  return c.html(
    <Template>
      <>
        <h1>
          Hello World{"  "}
          <a href="/create">
            <button>create</button>
          </a>
        </h1>
        {html`<script type="text/javascript">
                window.onload = () => {
                  function createIframeElement(src) {
                    const id = src.split("/").pop()
                    const a = document.createElement('a');
                    a.href = \`view/$\{id\}\`;
                    a.style.cssText = \`
                      display: block;
                      outline: 2px solid #007bff;
                      padding: 5px;
                      margin: 5px;
                      border-radius: 4px;
                      text-decoration: none;
                      color: inherit;
                    \`;

                    const div = document.createElement('div');
                    div.style.pointerEvents = 'none';

                    const iframe = document.createElement('iframe');
                    iframe.src = \`view/$\{id\}\`;

                    div.appendChild(iframe);
                    a.appendChild(div);

                    return a;
                  }

                  let grid = document.querySelector(".grid");
                  function subscribe(){
                    try {
                      let eventSource = new EventSource("/subscribe");
                      eventSource.onopen = function () {
                        console.log("Connection to server opened.");
                      };
                      eventSource.onmessage = function (event) {
                        console.log("Data received:", event.data);
                        const iframe = createIframeElement(event.data)
                        grid.appendChild(iframe)
                      };
                      eventSource.onerror = function (event) {
                        if (event.eventPhase == EventSource.CLOSED) {
                          console.error("Connection was closed by the server.");
                        } else {
                          console.error("Error fetching data:", event);
                        }
                      };
                    } catch (error) {
                      console.error("Error initializing EventSource:", error);
                    }
                  };
                  subscribe();
                }
              </script>`}
        <div
          class="grid"
          style={{
            "grid-template-rows": "auto",
            "grid-template-columns": "repeat(4, 1fr)",
            "gap": "1rem 1rem",
            "grid-auto-rows": "100px",
          }}
        >
          {sv.ids.map((id) => <Iframe id={id} />)}
        </div>
      </>
    </Template>,
  );
});

function subscribe() {
  let disposable: () => void;
  const body = new ReadableStream({
    start(controller) {
      disposable = sv.on("load", (name) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${sv.url}/${name}\n\n`),
        );
      });
    },
    cancel() {
      disposable();
    },
  });
  return body;
}

app.get("/subscribe", () => {
  return new Response(subscribe(), {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
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
    // Call openai
    const response = await openai.createChatCompletion({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
            You are tasked with creating a function that takes a request and returns a response. The function must
            be a default export. Do not return the response as markdown, only pure code. Do not wrap any code in markdown
            code fences. Responses from the function should always return HTML. Don't generate code that reads query parameters
            or url.searchParams from the request. This function executes in Deno's runtime.
            
            Here's an example

            export default function handler(req: Request) {
              return new Response("Hello World");
            }
            
            For the following prompt, create the function that satisfies the prompt.
          `.trim(),
        },
        {
          role: "user",
          content: prompt as string,
        },
      ],
    });

    console.log(response.data.choices[0].message?.content);

    await sv.load(
      id,
      response.data.choices[0].message?.content as string,
    );
  }
  return c.html(
    <Template>
      <div style={{ display: "flex", gap: "1rem" }}>
        <iframe
          style={{ width: "100%", height: "500px" }}
          src={`/view/${id}`}
        />
        <PromptForm input={prompt} />
      </div>
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

app.get("/view/:id", (c) => {
  const id = c.req.param("id");
  return fetch(`${sv.url}/${id}`).then((res) =>
    res.status === 404
      ? c.html(
        <Template>
          <h1>404 - Not Found</h1>
          <p>The requested ID does not exist.</p>
          <a href="/">Return Home</a>
        </Template>,
      )
      : res
  );
});

const serverAbortController = new AbortController();
const server = Deno.serve({
  reusePort: true,
  signal: serverAbortController.signal,
}, app.fetch);

const shutdown = (signal: string) => async () => {
  console.log(`[DEMO] ${signal}`);
  await sv.shutdown();
  const serverTimeout = setTimeout(() => {
    serverAbortController.abort();
    Deno.exit(1);
  }, 3000);
  await server.shutdown();
  clearTimeout(serverTimeout);
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", shutdown("SIGINT"));
Deno.addSignalListener("SIGTERM", shutdown("SIGTERM"));
