FROM denoland/deno:2.0.2

WORKDIR /app

COPY src/bootstrap.ts .
COPY src/mutex.ts .

# Create a directory for the data volume
RUN mkdir -p /app/data

# Set the volume
VOLUME /app/data

ENTRYPOINT ["deno", "run", "--no-prompt", "--allow-net", "--deny-net", "localhost", "--allow-read", "/app/data", "bootstrap.ts"]
