FROM ferbas/android-emulators:13

COPY ./scripts/register_and_hb.sh /register_and_hb.sh
RUN chmod +x /register_and_hb.sh

COPY ./scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5555 5900
ENTRYPOINT ["/entrypoint.sh"]
