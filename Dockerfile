FROM python:3.12-slim

WORKDIR /app

COPY index.html server.py ./
COPY css/ css/
COPY js/ js/
COPY data/ch-municipalities.topojson data/
COPY data/municipalities.json data/

RUN adduser --disabled-password --no-create-home appuser && \
    chown -R appuser:appuser /app/data
USER appuser

EXPOSE 8000

CMD ["python3", "server.py", "--port", "8000"]
