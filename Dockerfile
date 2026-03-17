FROM python:3.12-slim

WORKDIR /app

COPY index.html server.py ./
COPY css/ css/
COPY js/ js/
COPY data/ch-municipalities.topojson data/
COPY data/municipalities.json data/

EXPOSE 8000

# SQLite cache persisted via volume mount at /app/data/
CMD ["python3", "server.py", "--port", "8000"]
