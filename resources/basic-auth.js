function handler(event) {
  var HTTP_BASIC_AUTH_CREDS = "";// HTTP_BASIC_AUTH_CREDS
  if (!HTTP_BASIC_AUTH_CREDS) {
    return {
      statusCode: 502,
      statusDescription: "Bad Gateway",
    };
  }

  // Credentials (basic tokens) should be passed by environment
  // variable. Multiple can be passed, separated by a ";"
  var credentials = HTTP_BASIC_AUTH_CREDS.split(";");
  var authHeaders = event.request.headers.authorization;
  var expected = credentials.map(function (token) {
    return "Basic " + token;
  });

  // If an Authorization header is supplied and it's an exact match, pass the
  // request on through to CF/the origin without any modification.
  if (authHeaders && expected.includes(authHeaders.value)) {
    return event.request;
  }

  // But if we get here, we must either be missing the auth header or the
  // credentials failed to match what we expected.
  // Request the browser present the Basic Auth dialog.
  return {
    statusCode: 401,
    statusDescription: "Unauthorized",
    headers: {
      "www-authenticate": {
        value: 'Basic realm="Enter credentials for this site!"',
      },
    },
  };
}