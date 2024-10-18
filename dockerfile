FROM denoland/deno:2.0.2

COPY src/bootstrap.ts .

ENTRYPOINT ["deno", "run", "--no-prompt", "--allow-net", "bootstrap.ts"]