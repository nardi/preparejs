(function() {
    try {
	    Object.defineProperty(window, 'onServer', {'value':false});
	    Object.defineProperty(window, 'onClient', {'value':true});
    } catch (e) {
	    window.onServer = false;
        window.onClient = true;
    }

    window.include = function(file) {
        var req = new XMLHttpRequest();
        req.open('GET', file, false);
        req.send(null);
        var src = req.responseText;
        return eval(src);
    };
})();