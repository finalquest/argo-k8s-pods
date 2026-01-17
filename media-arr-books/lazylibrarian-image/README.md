## Build and publish

Build and push to your registry:

```bash
docker build -t harbor.finalq.xyz/tools/lazylibrarian:latest .
docker push harbor.finalq.xyz/tools/lazylibrarian:latest
```

If you use a different registry or tag, update the image reference in
`media-arr-books/deployment-lazylibrarian.yaml`.
