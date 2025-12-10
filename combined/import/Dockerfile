FROM postgres:15

# Install postgresql-client for psql
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy restore script
COPY restore.sh /restore.sh
RUN chmod +x /restore.sh

# Set entrypoint
ENTRYPOINT ["/restore.sh"]

