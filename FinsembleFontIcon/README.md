# FinsembleFontIcon

## Overview
The FinsembleFontIcon component just renders an `<i>` element with the class that's passed into the `icon` property. This is just a helper, you do not need to use it.

## Props
                                                                       	|
| Prop               	| Type     	        | Possible Values | Default Value | Description |
|--------------	        |----------------	|-------------	  | ------------- | -------------	|
| icon               	| string   	| See finFont.css for possible class names 	| null          	| Class for the font icon. See finfont.css for a list of possible finsemble font icons. Also works with any other font-icon (assuming you include the css for that font-family). |

## Example
The button below is the workspaceButton that appears in the toolbar if the workspace is pinned.
```jsx
	<FinsembleFontIcon className="finsemble-toolbar-button-icon pinned-icon pinned-workspace-icon"
		icon="ff-workspace"/>
```