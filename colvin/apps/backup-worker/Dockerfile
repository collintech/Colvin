FROM postgres:18
RUN apt-get update && apt-get install -y --no-install-recommends nodejs gnupg rclone ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/colvin
COPY --chown=postgres:postgres scripts/backup/ ./scripts/backup/
COPY --chown=postgres:postgres database/migrations/ ./database/migrations/
COPY --chown=postgres:postgres apps/backup-worker/ ./apps/backup-worker/
USER postgres
ENTRYPOINT []
CMD ["timeout", "--signal=TERM", "--kill-after=15s", "10m", "node", "apps/backup-worker/worker.mjs"]
