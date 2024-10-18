import { Hono } from "npm:hono";
import type { FC } from "npm:hono/jsx";

const app = new Hono();

const code = `
#!/bin/sh

# Check if Deno is installed
if ! command -v deno &> /dev/null
then
    # Install Deno
    curl -fsSL https://deno.land/install.sh | sh
    
    # Add Deno to PATH for the current session
    export DENO_INSTALL="$HOME/.deno"
    export PATH="$DENO_INSTALL/bin:$PATH"
fi

# Print Deno version
deno --version

# TODO: Run our script
# deno run oneoff-demo.ts
`.trim();

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

app.get("/", (c) => {
  /**
   * This is the code that'll be displayed when visiting the site in the browser
   */
  if (c.req.header("Accept")?.includes("text/html")) {
    return c.html(
      <Template>
        <>
          <h1>Instructions</h1>
          <p>Run this script to setup the demo</p>
          {/* TODO: This obviously won't be localhost */}
          <pre>
            <code class="language-sh">
              curl -fsSL http://localhost:8000 | sh
            </code>
          </pre>
          <p>
            {/* TODO: Just link to the github so they can see what we're doing */}
            (Here's the contents of the script so it's marginally less sketchy)
          </p>
          <pre>
            <code class="language-sh">
              {code}
            </code>
          </pre>
        </>
      </Template>,
    );
  }

  /**
   * This is what folks w/ get when they curl the endpoint
   */
  return c.text(code);
});

export default app;
