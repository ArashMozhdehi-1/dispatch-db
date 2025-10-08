FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p logs && chmod 755 logs && \
    touch logs/errors.log logs/performance.log logs/audit.log && \
    chmod 666 logs/*.log

CMD ["python", "start_app.py"]
