/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

/**
 * A Button Consists of a Title and/or an Icon and a tooltip.
 */

import React from 'react';
import FontIcon from '../FinsembleFontIcon/FinsembleFontIcon';
import ButtonLabel from '../FinsembleButtonLabel/FinsembleButtonLabel';

//Default to giving every button a pointer cursor.
const styles = {
	cursor: 'pointer'
};

//The specific buttonTypes we'll apply CSS classes for.
const classMap = {
	MenuItemLabel: 'menu-item-label',
	MenuItemActions: 'menu-item-actions',
	Toolbar: 'finsemble-toolbar-button',
	Dialog: 'fsbl-button'
}
/**
 * Used for menuLauncher buttons. This gets us the position relative to the current monitor, so we know where where the user can click and cause a blur. If the user clicks outside of the button's bounding box, we blur the menu. A subsequent click will open the menu. If the user clicks the button to open the menu, then clicks the button again, we blur the menu, and the next click will not open the menu. This prevents a spastic, blinking menu when the user clicks it twice.
 *
 * @param {any} domElementClientRect
 * @returns
 */
function BoundingBoxRelativeToWindow(domElementClientRect) {
	let boundingBox = {
		top: FSBL.Clients.WindowClient.options.defaultTop - domElementClientRect.top,
		left: FSBL.Clients.WindowClient.options.defaultLeft + domElementClientRect.left,
		width: domElementClientRect.width,
		height: domElementClientRect.height
	};

	boundingBox.right = boundingBox.left + boundingBox.width;
	boundingBox.bottom = boundingBox.top + boundingBox.height;

	return boundingBox;
}

/**
 * The building block for most of our toolbar and menu buttons.
 *
 * @class Button
 * @extends {React.Component}
* */
export default class Button extends React.Component {
	constructor(props) {
		super(props);
		//Necessary to bind the correct _this_ to methods on the class.
		this.bindCorrectContext();
		this.finWindow = fin.desktop.Window.getCurrent();
		//Used by menuLaunchers. see `this.launchMenu` for more.
		this.openMenuOnClick = true;
	}

	/**
	 * Ensures that the `this` is correct when the functions below are invoked.
	 *
	 * @memberof Button
	 */
	bindCorrectContext() {
		this.launchMenu = this.launchMenu.bind(this);
		this.launchComponent = this.launchComponent.bind(this);
		this.validateProps = this.validateProps.bind(this);
	}

	/**
	 * Helper to validate properties and to throw errors if they're missing.
	 *
	 * @param {any} propName
	 * @memberof Button
	 */
	validateProp(propName) {
		if (typeof this.props[propName] === 'undefined') {
			throw new Error(`Missing Requeired Prop on FinsembleButton: ${propName}`);
		}
	}
	/**
	 * Loops through and calls validateProp.
	 *
	 * @param {any} arr
	 * @memberof Button
	 */
	validateProps(arr) {
		arr.forEach((propName) => {
			this.validateProp(propName);
		});
	}
	/**
	 * Handles all of the logic for menuLaunching.
	 *
	 * 1. User clicks button; we open the menu below the button. We add a listener on blur. When the window blurs, we check to see if the user clicked our button again. Blur happens in the menu before the click will happen in the button.
	 * 2a. User clicks the button again. We hide menu and invalidate the next button click, so that the menu will not open twice. This allows the button to open _and_ close the menu.
	 * 2b. User clicks outside of the button. We hide the menu. Next click will open the menu.
	 *
	 * @param {any} e Click event.
	 * @memberof Button
	 */
	launchMenu(e) {
		//If the click action has been invalidated (because the user clicked the menu Launcher while the menu was open), we allow subsequent clicks to open the menu.
		if (!this.openMenuOnClick) {
			this.openMenuOnClick = true;
			return;
		}
		let self = this;
		//Params for the dialogManager.
		let params = {
			monitor: "mine",
			position: "relative",
			left: e.currentTarget.getBoundingClientRect().left,
			forceOntoMonitor: true,
			top: "adjacent",
			spawnIfNotFound: true
		};
		//gets the parent button wrapper.
		let DOM = e.target.parentElement;

		/**
		 * When the menu is shown, we add a blur event handler. This allows us to figure out if the user is trying to close the menu by clicking the button a 2nd time, or if they're trying to open the menu on the first click.
		 * @param {*} shownErr
		 * @param {*} shownResponse
		 */
		var onMenuShown = function (shownErr, shownResponse) {
			if (shownResponse) {
				let finWindow = shownResponse.finWindow;
				var onMenuBlurred = function (blurErr, blurResponse) {
					//On blur, check the mouse position. If click was inside of the button, we invalidate the click event that will be coming soon.
					let clientRect = DOM.getBoundingClientRect();
					let boundingBox = new BoundingBoxRelativeToWindow(clientRect)
					//Assumption is that the blur happened elsewhere. If the blur happened on the button, we don't want to open the menu on click.
					let openMenuOnClick = true;
					fin.desktop.System.getMousePosition((position) => {
						//If the click was inside of the opening button's bounding rectangle, don't hide.
						if (position.left > boundingBox.left && position.left < boundingBox.right && position.top < boundingBox.bottom && position.top > boundingBox.top) {
							openMenuOnClick = false;
						}

						self.openMenuOnClick = openMenuOnClick
					});
					finWindow.removeEventListener('blurred', onMenuBlurred);
				};
				finWindow.addEventListener('blurred', onMenuBlurred);

				//Our appLauncher is listening on this channel for items to populate it.
				//@todo move this into the AppLauncherButton code.
				FSBL.Clients.RouterClient.publish(`${finWindow.name}.ComponentsToRender`, self.props.customData);
			}
		};

		//Display the menu.
		FSBL.Clients.LauncherClient.showWindow({
			windowName: self.props.menuType + (self.props.label ? self.props.label : self.props.tooltip),
			componentType: self.props.menuType
		}, params, onMenuShown);
	}

	launchComponent(e) {
		FSBL.Clients.LauncherClient.spawn(this.props.component, { addToWorkspace: true });
	}

	/**
	 * Helper to console.warn.
	 *
	 * @param {string} msg
	 * @memberof Button
	 */
	warn(msg) {
		console.warn(msg);
	}

	render() {
		//If the user doesn't want to show the component, return null.
		if (this.props.show === false) {
			return null;
		}
		//If we don't receive an onClick prop, we will throw a warning to the console.
		let warnNoOnClick = this.warn.bind(this, 'No onclick property passed to the Finsemble Button component.');
		this._onClick = this.props.onClick || warnNoOnClick;

		//Some intitial setup/defaults setting.
		let self = this,
			image = null,
			label = null,
			iconPosition = this.props.iconPosition || "left",
			iconClasses = this.props.iconClasses || '',
			classes = this.props.className || '',
			types = this.props.buttonType || [];

		//Render icon.
		if (this.props.icon) {
			image = (<img className={iconClasses} src={this.props.icon} />);
		}
		//coerce to array.
		if (typeof types === 'string') {
			types = [types];
		}

		//Render fontIcon.
		if (this.props.fontIcon) {
			if (types.includes('Toolbar')) {
				iconClasses += ' finsemble-toolbar-button-icon';
			}
			image = (<FontIcon className={iconClasses} icon={this.props.fontIcon} />);
		}

		//Render label.
		if (this.props.label) {
			label = <ButtonLabel align={iconPosition === 'left' ? 'right' : 'left'} label={this.props.label} />;
		}


		if (types.length) {
			//Add classes to the button based on the types passed in.
			types.forEach((type) => {
				if (classMap[type]) {
					classes += ` ${classMap[type]}`;
				}
			});
			//If the button is a MenuLauncher, set its onCLick to launchMenu.
			if (types.includes('MenuLauncher')) {
				//If you're a menuLauncher, you must tell us the type of menu to open.
				this.validateProp('menuType');
				this._onClick = this.launchMenu;
			}
			if (types.includes('AppLauncher')) {
				//If you're a menuLauncher, you must tell us the type of menu to open.
				this.validateProp('component');
				this._onClick = this.launchComponent;
			}
		} else {
			this.warn("No type property passed to button.");
		}

		//Wrapper to allow for beforeClick and AfterClick
		this.onClick = function (e) {
			if (self.props.beforeClick) self.props.beforeClick(e);
			if (self._onClick) self._onClick(e);
			if (self.props.afterClick) self.props.afterClick(e);
		}

		return (<div onMouseUp={this.props.onMouseUp}
			onMouseDown={this.props.onMouseDown}
			onClick={this.onClick}
			className={classes}>
			{image}
			{label}
			{this.props.children}
		</div>)
	}
}