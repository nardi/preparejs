Prepare.js
==========

An easy method for executing JavaScript on the server in a browser-like
environment, or more fancily, a basic framework for isomorphic JavaScript
applications.

Prepare can process HTML files, executing JS snippets along the way. To specify
the content of a script tag should be executed by Prepare, give it a type
attribute of (or similar to) "server", such as:

    <script type="server">console.log('Hi!');</script>
    <script type="on/server">
        var db = require('../db');
        $('post').text(db.get(request.split('/').pop()));
    </script>

These are then executed in a browser-like environment. In addition to all
standard node-functionality, the following is currently also available:
  - DOM implementation courtesy of jsdom
  - A request- and response-object
  - jQuery
  - A few other useful small things, see the source for specifics

After parsing the whole document, Prepare removes all server-side code, adds a
few useful definitions for the client side, and returns the resulting HTML.
Client side script tags (lacking the "server" attribute) will not be executed by
Prepare. To specify a script should be executed on both client and server,
use a type of "client/server". Inside of these scripts, you can distinguish
between the two via the onServer and onClient attributes. Note that all of the
code inside these scripts will still be transmitted to the client, so make sure
that it doesn't contain any sensitive information.

Another way to construct your pages is by using .html.js files. These are
JavaScript files that are executed in a similar environment, but let you start
with a blank slate. window.document is an empty document, so you can build your
document in anyway you want. Here's an example of a script that serves a .js.html
file indirectly:

    response.hold();
    require('fs').readFile('someFile.js.html', 'utf8', function(err, html) {
        document.write(html);
        response.release();
    });
    
This is (apart from having a different request/response object and being slower)
equivalent to visiting the .js.html file directly. By default, at the end of the
script (if the response is not held up), the current document is sent to the
client. You also have full access to the response object though, so you can decide
to send something else and close the connection yourself using response.end().

Planned additions:
 - Client-side require, mimicking node's version
 - Similarly, an easy way to use client/server modules
 - Express-like additions to the request object (maybe even further integration?)
 - Ease of use (installation and basic usage should be as simple as possible,
   to make it worth using :P)
   
Known bugs:
 - require does not work correctly in local modules (need a replacement that can
   fall back to the prepare node_modules).
