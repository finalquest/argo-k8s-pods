FROM budtmo/docker-android:emulator_13.0

USER root

RUN apt-get update && \
    apt-get install -y redis-tools && \
    apt-get clean

COPY ./scripts/register_and_hb.sh /usr/local/bin/register_and_heartbeat.sh
RUN chmod +x /usr/local/bin/register_and_heartbeat.sh

CMD /usr/local/bin/register_and_heartbeat.sh & exec "$@"
