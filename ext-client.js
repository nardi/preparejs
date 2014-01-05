try {
	Object.defineProperty(window, 'onServer', {'value':false});
	Object.defineProperty(window, 'onClient', {'value':true});
} catch (e) {
	window.onServer = false;
    window.onClient = true;
}

/* document.currentScript polyfill */
if ('undefined' === typeof document.currentScript) {
    (function(){
        var scripts = document.getElementsByTagName('script');
        document._currentScript = document.currentScript;

        var getScriptFromURL = function(url) {
            for (var i = 0; i < scripts.length; i++)
                if (scripts[i].src === url)
                    return scripts[i];

            return undefined;
        }

        var actualScript = function() {
            if (document._currentScript)
                return document._currentScript;
            
            var stack = new Error().stack;
           
            if (!stack)
                return undefined;

            var e = stack.indexOf(' at ') !== -1 ? ' at ' : '@';
            while (stack.indexOf(e) !== -1)
                stack = stack.substring(stack.indexOf(e) + e.length);
            stack = stack.substring(0, stack.indexOf(':', stack.indexOf(':')+1));

            return getScriptFromURL(stack);
        };
        
        if (document.__defineGetter__)
            document.__defineGetter__('currentScript', actualScript);
        else
            document.currentScript = actualScript;
    })();
}