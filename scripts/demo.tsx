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

const Iframe = ({ id }: { id: string }) => {
  return <iframe src={`${sv.url}/${id}`} />;
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
                  let grid = document.querySelector(".grid");
                  function subscribe(){
                    try {
                      let eventSource = new EventSource("/subscribe");
                      eventSource.onopen = function () {
                        console.log("Connection to server opened.");
                      };
                      eventSource.onmessage = function (event) {
                        console.log("Data received:", event.data);
                        const iframe = document.createElement("iframe");
                        iframe.src = event.data
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
        <div class="grid">
          {sv.ids.map((id) => <Iframe id={id} />)}
        </div>
      </>
    </Template>,
  );
});

function subscribe () {
  let disposable: () => void;
  const body = new ReadableStream({
    start(controller) {
      disposable = sv.on("load", (name) => {
        controller.enqueue(new TextEncoder().encode(`data: ${sv.url}/${name}\n\n`));
      })
    },
    cancel() {
      disposable()
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

    const success = await sv.load(
      id,
      response.data.choices[0].message?.content as string,
    );
    if (!success) {
      c.status(500);
      return c.html(
        <Template>
          <h1>Something went wrong</h1>
        </Template>,
      );
    }
  }
  return c.html(
    <Template>
      <div style={{ display: "flex", gap: "1rem" }}>
        <iframe
          style={{ width: "100%", height: "500px" }}
          src={`${sv.url}/${id}`}
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

const server = Deno.serve(app.fetch);

Deno.addSignalListener("SIGINT", async () => {
  console.log("SIGINT");
  await server.shutdown();
  await sv.shutdown();
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
  console.log("SIGTERM");
  await server.shutdown();
  await sv.shutdown();
  Deno.exit(0);
});
