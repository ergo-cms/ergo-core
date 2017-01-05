# ergo-core

The API comprises of all the files in the api folder, and are exported according to their .js name. These api functions are also mimic-ed in ergo-cli which expose information in a human readable format.

For example, 

* In ergo-core/api there is an init.js and looks like this:

```
	module.exports = function(folder, ...) { }
```

* In ergo-cli/api there is another init.js. This latter calls `require('ergo-core').init` as such:

```
	module.exports.init = function(folder, ...) {  
		...
		return require('ergo-core').init(folder, ...)
	}
```


### Note:

ALL complex functions exported to the CLI api are expected to return Promises, unless intrinsically syncronous (such as config.getConfigSync).

NOT all functions are exported through the CLI api (such as 'config', which is a regular helper api).


## Rendering Pipelines

The basic flow of rendering is like this:

```
start o------> plugin 1 --------------------------> plugin 2 ----...  ...---> :end
               (tex/md)                              (html)
             /         \                          /         \
            /           \                        /           \
           /             \                      /             \
     pre-render 1     post-render 1       pre-render 3     post-render 2
         |              /                          \
     pre-render 2  pre-post-render             post-pre-render
         |                |
		...              ...
```
Note that each pre-render and post-render stage can have it's own pre and post rendering stages. Shown above are:
* 2 pre-renderers for plugin 1 (pre-render 1 and pre-render 2).
* 1 post-renderer for plugin 1, which has it's own pre-renderer (pre-post-render)
* 1 pre-renderer for plugin 2 (pre-render 3), which has it's own post-renderer (post-pre-render)
* 1 post-renderer for plugin 2 (post-render 2)

The order of execution of the above is:

1. pre-render 1
1. pre-render 2
1. plugin 1
1. for each file ... ?
1. post-render 1
1. pre-post-render
1. pre-render 3
1. post-pre-render
1. plugin 2
1. post-render 2

Each stage is executed on ALL files, before proceding to the next. 


A simple less -> css with a separate css-minifier would look like this:
```
start o--->  less --->  css-minifier ---> :end

```


The default plugin/rendering pipleline for a textile/markdown file is more involved. An optional html minifier is also indicated where it woulc be located in the pipeline:
```
start o------> plugin 1 ------------> [html-minifier] ----...  ...---> :end
               (tex/md)                   (html)
             /         \
            /           \
           /             \
     header_read      template_man 
              \                  \ 
            header_add           simpletag
```

Note:

* 'header_read' is a pre-render task of textile/marked plugins
* 'header_add' is a post-render task of 'header_read'
* 'template_man' is a post-render task of textile/marked plugins
* 'simpletag' (or mustache) is a post-render task of 'template_man' 

So, in a linear manner, the order of execution is, where each task is done on all files before proceeding to the next:

```
start o---> header_read
        ---> header_add ...
          ---> textile/markdown ...
            ---> template_man
              ---> simpletag ...
       (optional) ---> html-minifier
                    ---> :end
```

Notes:

* The 'header_read' & subsequent 'header_add' plugins gather various bits of data and fill out the `fields` property for each file. The main content is in fields.content.
* The 'header_read' is designed to be replaceable by a yaml reader, if that's your thing.
* Extra fields are added in 'header_add' plugin, such as date, seo names, etc.
* The 'header_add' also gathers lists of info, notably post_types, categories and tags and places them in context.fields
* The textile/markdown converts just the 'content' field
* The 'template_man':
 * Looks up and applies any 'layouts', eg blog posts, vs articles, vs other to the data, modifying the 'content' field. 
* The tag renderer simpletag:
 * Renders the 'content' field according to the 'fields' property AND context.fields, modifying the 'content' field
 * Is designed to be replaceable, for example by mustache.
* If there is an HTML renderer (in order to minify), it is last to be invoked, but can have it's own pre & post-rendering cycles too.

So, when 'preparing' any partials (/snippets) for rendering, they also go through the above pipleline.



### Race Conditions

There are possible race conditions. eg:

* blog.tem.html
* blog/blog post.md

The render chain for both is:

* template_man, simpletag
* header_read, header_add, marked, template_man, simpletag

However, if we render each in order, then `blog.tem.html` will try to render before `header_add` has been reached in the other. There are 2 solutions to this:

1. 'right align' all rendering, padding with a 'dummy_render', such that the render chains are:
 * dummy_render, dummy_render, dummy_render, template_man, simpletag
 * header_read , header_add  , marked      , template_man, simpletag
 (Which just happens to work, in this case)
1. A more tricky 'alignment' such that all eg 'template_man', will be rendered at the same time

Option 1. has been chosen, for now...








