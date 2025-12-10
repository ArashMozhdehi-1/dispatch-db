# Importer image: based on postgis, with restore script baked in
FROM postgis/postgis:15-3.3

WORKDIR /import
COPY restore.sh /import/restore.sh
RUN chmod +x /import/restore.sh

ENTRYPOINT ["/bin/bash", "/import/restore.sh"]


