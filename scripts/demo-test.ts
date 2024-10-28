async function postIncrementingPrompts(concurrent = false) {
  const baseUrl = "http://0.0.0.0:8000";
  const createUrl = `${baseUrl}/create`;
  const viewUrl = (id: string) => `${baseUrl}/view/${id}`;
  const maxPrompts = 30;

  if (concurrent) {
    const requests = Array.from({ length: maxPrompts }, (_, i) => {
      const body = `prompt=testing+${i + 1}`;
      return fetch(createUrl, {
        method: "POST",
        headers: {
          "accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "accept-language": "en-US,en",
          "cache-control": "no-cache",
          "content-type": "application/x-www-form-urlencoded",
          "pragma": "no-cache",
          "sec-gpc": "1",
          "Set-Cookie": `id=${i}`,
          "upgrade-insecure-requests": "1",
        },
        body: body,
        referrer: baseUrl,
      }).then((response) => {
        console.log(`Posted prompt ${i + 1}: ${body}`);
        console.log(`Response status: ${response.status}`);
        console.log(viewUrl(i.toString()));
        fetch(viewUrl(i.toString())).then((response) => {
          console.log(`GET /view/:id Response status: ${response.status}`);
        });
      }).catch((error) => {
        console.error(`Error posting prompt ${i + 1}:`, error);
      });
    });

    await Promise.all(requests);
  } else {
    for (let i = 0; i < maxPrompts; i++) {
      const body = `prompt=testing+${i + 1}`;
      try {
        const response = await fetch(createUrl, {
          method: "POST",
          headers: {
            "accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "accept-language": "en-US,en",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded",
            "pragma": "no-cache",
            "sec-gpc": "1",
            "Set-Cookie": `id=${i}`,
            "upgrade-insecure-requests": "1",
          },
          body: body,
          referrer: baseUrl,
        });
        console.log(`Posted prompt ${i + 1}: ${body}`);
        console.log(`Response status: ${response.status}`);
        console.log(viewUrl(i.toString()));
        const getResponse = await fetch(viewUrl(i.toString()));
        console.log(`GET /view/:id Response status: ${getResponse.status}`);
      } catch (error) {
        console.error(`Error posting prompt ${i + 1}:`, error);
      }
    }
  }
}

// Run the function
postIncrementingPrompts();
