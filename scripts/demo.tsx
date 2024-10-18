import { Hono } from "npm:hono";

const app = new Hono();

const code = `
#!/bin/sh

# Check if Deno is installed
if ! command -v deno &> /dev/null
then
    echo "Deno is not installed. Installing Deno..."
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
`;

app.get("/", (c) => {
  /**
   * This is the code that'll be displayed when visiting the site in the browser
   */
  if (c.req.header("Accept")?.includes("text/html")) {
    return c.html(
      <html>
        <body>
          <h1>Instructions</h1>
          <p>Run this script to setup the demo</p>
          <p>
            {/* TODO: This obviously won't be localhost */}
            <code>curl -fsSL http://localhost:8000 | sh</code>
          </p>
          <p>
            {/* TODO: Just link to the github so they can see what we're doing */}
            (Here's the contents of the script so it's marginally less sketchy)
          </p>
          <pre>
            <code>
              {code}
            </code>
          </pre>
        </body>
      </html>,
    );
  }

  /**
   * This is what folks w/ get when they curl the endpoint
   */
  return c.text(code);
});

export default app;
