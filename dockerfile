FROM denoland/deno:2.0.2

WORKDIR /app

COPY src/bootstrap.ts .
COPY src/modules.ts .

# Create a directory for the data volume
RUN mkdir -p /app/data

# Set the volume
VOLUME /app/data

ENTRYPOINT ["deno", "run", "--no-prompt", "--allow-net", "--unstable-kv", "--allow-read", "/app/data/modules", "bootstrap.ts"]
