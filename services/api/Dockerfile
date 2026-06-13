FROM python:3.11-slim

WORKDIR /app

# Docker CLI (for system update from inside the container)
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git openssh-client \
    && curl -SL "https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64" \
       -o /usr/local/bin/docker-compose \
    && chmod +x /usr/local/bin/docker-compose \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
