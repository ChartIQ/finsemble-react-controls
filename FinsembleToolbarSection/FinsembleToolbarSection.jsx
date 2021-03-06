/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

/**
 * The FinsembleToolbarSection control shows bunch of toolbar buttons or other custom React components. It optionally handles overflow if the contents do not fit.
 *
 * How overflow render works:
 *  Initial Load: Render everything -> componentDidUpdate() fires -> calculate overflow -> If needed rerender
 *  On Update: (toolbarStateChanged) -> set minOverflowIndex to something big so component rerenders -> componentDidUpdate() fires -> calculate overflow -> If needed rerender
 *
 * How overflow is handled
 *  The Overflow handling component will receive a list of buttons that overflowed.
 *  It needs to render those buttons and when clicked, transmit the index of the clicked item back to the toolbar on the clickChannel
 *
 */
import FinsembleDraggable from '../FinsembleDraggable/FinsembleDraggable';
import FinsembleDroppable from '../FinsembleDroppable/FinsembleDroppable';


import React from 'react';
import FinsembleButton from '../FinsembleButton/FinsembleButton';
const SECTION_BASE_CLASS = 'finsemble-toolbar-section';
const DEFAULT_MINIMUM_OVERFLOW = 10000000;
//The number of pixels to add to the calculation where we determine whether a component is overflowing. We subtract an additional 70 pixels to account for the padding between the last item and the overflow button. This way the overflow button never gets hidden behind the right section of the toolbar.
const OVERFLOW_BUTTON_OFFSET = 55;
export default class FinsembleToolbarSection extends React.Component {
	constructor(props) {
		super(props);
		this.props = props;
		this.state = {
			overflow: [],
			pins: [],
			clickChannel: this.props.clickChannel || FSBL.Clients.WindowClient.windowName + '-overflow-clickChannel'
		};

		this.reorderPins = this.reorderPins.bind(this);
		this.processPins = this.processPins.bind(this);
		this.handleResize = this.handleResize.bind(this);
		this.onDragStart = this.onDragStart.bind(this);
		this.onDrag = this.onDrag.bind(this);
		this.onDragEnd = this.onDragEnd.bind(this);
		this.onDragOver = this.onDragOver.bind(this);
		this.onDrop = this.onDrop.bind(this);
		this.onMouseLeave = this.onMouseLeave.bind(this);
		this.groupMaskShown = this.groupMaskShown.bind(this);
		this.groupMaskHidden = this.groupMaskHidden.bind(this);
		this.configCache = {};
		finsembleWindow.getBounds((err, bounds) => {
			this.windowBounds = bounds;
		});

	}

	/**
	 *
	 * Processes pin changes on the global toolbar store. This happens when a pin is added or removed to any toolbar. It also happens when a pin is reordered from the toolbar or the overflow menu.
	 *
	 * @param {*} err
	 * @param {*} data
	 */
	processPins(err, data) {
		if (!data.value) { return; }
		//Pins are saved to storage and rendered as an array. When we persist to the distributed store, we convert the pins to an object because right now we cannot save arrays properly.
		function pinsToArray(obj) {
			let arr = [];
			for (let i in obj) {
				let pin = obj[i];
				if (!pin) continue;
				if (typeof (pin.index) === 'undefined') {
					pin.index = Object.keys(obj).length;
				}
				arr[pin.index] = pin;
			}
			return arr.filter((el) => el !== null);
		}
		function pinsToObj(arr) {
			let obj = {};
			arr.forEach((el, i) => {
				if (el) {
					let key = el.component || el.label;
					obj[key] = el;
					obj[key].index = i;
				}
			});
			return obj;
		}
		let storedPins = this.state.pins,
			incomingPins = data.value,
			pinsChanged = false;
		//If we get an object, convert it to an array.
		if (!Array.isArray(data.value)) {
			incomingPins = pinsToArray(data.value);
		}
		//Just lets us know if any of them have changed.
		let orderOrLabelsChanged = incomingPins.some((pin, index) => {
			let storedPin = storedPins[index], incomingPin = incomingPins[index];
			if (storedPin && incomingPin) {
				// component pins have a 'component' prop which is the type of the component.
				// workspace pins do not. They have a label. (as do the components...but component
				// labels can change. workspace labels cannot).
				const pinKey = storedPin.component ? 'component' : 'label';
				return (storedPins[index][pinKey] !== incomingPins[index][pinKey]) || storedPin.label !== incomingPin.label;
			}
			return true;
		});

		//Either a pin was added or removed.
		if (incomingPins.length !== storedPins.length) {
			pinsChanged = true;
		} else if (orderOrLabelsChanged) {
			pinsChanged = true;
		}
		// If pins have changed, rerender
		if (pinsChanged || this.initialLoad) {
			let pinObj = pinsToObj(incomingPins);
			this.setState({ pins: incomingPins, minOverflowIndex: 1000000 });
			FSBL.Clients.StorageClient.save({ topic: 'finsemble', key: 'toolbarPins', value: incomingPins });
			this.state.pinStore.setValue({ field: 'pins', value: pinObj });
			this.initialLoad = false;
		}
	}

	/**
	 * Spawn a menu
	 *
	 */
	spawnMenu(menu) {
		let windowName = menu.menuType + (menu.label ? menu.label : menu.tooltip);
		const COMPONENT_UPDATE_CHANNEL = `${windowName}.ComponentsToRender`;
		FSBL.Clients.LauncherClient.showWindow({
			windowName: windowName,
			componentType: menu.menuType
		}, { spawnIfNotFound: true }, function (err, response) {
			FSBL.Clients.RouterClient.publish(COMPONENT_UPDATE_CHANNEL, menu.customData);
		});
	}

	/**
	 * When the window resizes, we set the overflow index huge so we recalculate the overflow.
	 * @param {*} e
	 */
	handleResize(e) {
		this.saveButtonsToOverflowStore(e, this);
		this.setState({ minOverflowIndex: DEFAULT_MINIMUM_OVERFLOW, overflow: [] });
	}

	/**
     * Trigger a click on the proper item. index + 1 because overflow menu launching component is added.
     *
     * @param {number} index
     * @memberof FinsembleToolbarSection
     */
	triggerClick(index, element) {
		function getToolbarButton(el) {
			if (el.children) {
				for (let i = 0; i < el.children.length; i++) {
					let child = el.children[i];
					if (child.children[0].className.includes('finsemble-toolbar-button')) {
						return child.children[0];
					} else {
						return getToolbarButton(child);
					}
				}
			}
			return null;
		}
		if (!element) element = this.element.children[index + 1];
		let toolbarButton = getToolbarButton(element);
		if (toolbarButton) {
			toolbarButton.click();
		} else {
			console.warn(`Could not find button to click for index: ${index}`);
		}
	}

	/**
     * Do we have an overflow? Assumes 40 as the size of the overflow component -> TODO: make this dynamic.
     *
     * @returns
     * @memberof FinsembleToolbarSection
     */
	hasOverflow() {
		var e = this.element;
		//If the first element in the sectioin would be sent to the overflow menu, we don't render the section. In that case, e would be null.
		if (e === null || e.offsetWidth === 0) return false;
		let offset = 0;
		//If we already have an overflow, we should account for the overflow button in our calculations.
		if (this.state.minOverflowIndex !== DEFAULT_MINIMUM_OVERFLOW) {
			offset = 20;
		}
		return (e.offsetWidth < e.scrollWidth - offset);
	}


	/**
     * This is used on clicking the overflow component. It adds the communication channel for clicks and the overflowing items to the overflowMenuStore.
     * beforeClick (see FinsembleButton) is used because this needs to happen before the default click action.
     *
     * @param {any} e
     * @param {any} self
     * @memberof FinsembleToolbarSection
     */
	saveButtonsToOverflowStore(e, self) {
		if (!self.state.overflowStore || !self.state.overflowStore.setValue) return;
		self.state.overflowStore.setValue({ field: 'clickChannel', value: self.state.clickChannel });
		function makeButtonsSafeForRouter(overflow) {
			return overflow.map((el) => {
				delete el.item.children;
				return el;
			});
		}
		let buttons = makeButtonsSafeForRouter(self.state.overflow);
		//Before we set the buttons, set the pins in the overflow store. This way, if the user tries to
		//reorder their list of buttons, they can calculate the offset and send back a proper changeEvent.
		//By default, the 1st index will be 0 in the overflow menu, but that pin may be 10th in the list of pins. This block
		//allows reordering in the overflow menu to work properly.
		self.state.overflowStore.setValue({ field: 'pins', value: self.state.pins }, () => {
			self.state.overflowStore.setValue({
				field: 'buttons',
				value: buttons
			});
		});
	}

	/**
	 * When the overflow menu or toolbar section reorders items, we send an event off to the global toolbar store, which reorders the pins. Then it sets the value on the global store, which we receive, and rerender.
	 * @param {*} changeEvent
	 */
	reorderPins(changeEvent) {
		this.state.pinStore.Dispatcher.dispatch({ actionType: 'reorderPins', changeEvent: changeEvent });
	}


	/**
     * Here if we have overflow, force a rerender by setting the state. state.overflow = overflowing items. state.minOverflowIndex = where overflow starts, i.e. hide items starting there
     *
     * @returns
     * @memberof FinsembleToolbarSection
     */
	componentDidUpdate() {
		if (!this.props.handleOverflow) return;
		var self = this;
		function getComponentProps(cmp) {
			//if the component has children, we want the properties of the child..if not, we want the component's properties. the overflow menu needs those.
			//@todo, do this better. give the cmp a unique id that we can grab from props or props.children...just traverse the tree until we find it.
			if (cmp.props.children) {
				return cmp.props.children.props;
			}
			return cmp.props;
		}
		if (self.hasOverflow()) {
			var e = self.element;
			//conservative estimate of the 'right' side of the item. We cut the item off before the overflow button can accidentally get hidden.
			var right = e.offsetLeft + e.offsetWidth - OVERFLOW_BUTTON_OFFSET;
			var overflow = [];
			var minOverflowIndex = DEFAULT_MINIMUM_OVERFLOW;
			for (var i = 0; i < e.children.length; i++) {
				var item = e.children[i];
				if (minOverflowIndex === DEFAULT_MINIMUM_OVERFLOW && (item.offsetLeft + item.offsetWidth) > right) {
					minOverflowIndex = i;
				}
				if (i >= minOverflowIndex) {
					//On quick resizes, this can get out of sync. e.g., minOverflowIndex could be 4, but we might only have 3 elements to render.
					if (self.children[i]) {
						overflow.push({ item: getComponentProps(self.children[i]), index: i });
					}

				}
			}

			if (overflow.length === self.state.overflow.length && self.state.minOverflowIndex === minOverflowIndex) return;


			self.setState({
				overflow: overflow,
				minOverflowIndex: (overflow[0] ? overflow[0].index : minOverflowIndex)
			}, () => {
				self.saveButtonsToOverflowStore(null, self);
			});
		}
	}

	mouseInWindow(mp) {
		let border = 3;
		if (mp.x >= (this.windowBounds.left + border) && mp.x <= (this.windowBounds.right - border) && mp.y >= (this.windowBounds.top + border) && mp.y <= (this.windowBounds.bottom - border)) {
			console.log('mouse is in window');
			return true;
		}
		console.log('mouse is in not window');
		return false;
	}

	startMouseTracking(component) {
		finsembleWindow.getBounds((err, bounds) => {
			this.windowBounds = bounds;
		});
		FSBL.System.getMousePosition((err, mp) => {
			mp.height = this.configCache[component].height;
			mp.width = this.configCache[component].width;
			if (this.dragging) {
				let mouseInWindow = this.mouseInWindow(mp);
				if (!this.dragScrimVisible && !this.groupMaskVisible && !mouseInWindow) {
					this.props.dragScrim.show();
					this.dragScrimVisible = true;
				} else if (this.dragScrimVisible && (this.groupMaskVisible || mouseInWindow)) {
					this.props.dragScrim.hide();
					this.dragScrimVisible = false;
				}
				if (this.dragScrimVisible) {
					this.props.dragScrim.setBounds(mp);
				}

				setTimeout(() => {
					this.startMouseTracking(component);
				}, 10);

			} else {
				this.props.dragScrim.hide();
				this.dragScrimVisible = false;
				if (this.props.groupMask) {
					this.props.groupMask.removeEventListener('shown', this.groupMaskShown);
					this.props.groupMask.removeEventListener('hidden', this.groupMaskHidden);
				}
			}
		});
	}

	groupMaskShown() {
		this.groupMaskVisible = true;
	}

	groupMaskHidden() {
		this.groupMaskVisible = false;
	}

	onDragStart(e, pin) {
		if (this.dragging) return; //prevent bad situations from unspawned windows
		this.dragging = true;
		//@brad commented out on 9/12. Not ready for release just yet.
		// if (pin.type == 'componentLauncher' && FSBL.Clients.WindowClient.startTilingOrTabbing) {
		// 	this.draggedGuid = Date.now() + '_' + Math.random();
		// 	this.tiling = { state: 'started', pin: pin };
		// 	console.log('start tiling on drag start');
		// 	let data = Object.assign({ waitForIdentifier: true, componentType: pin.component, guid: this.draggedGuid }, pin);
		// 	FSBL.Clients.WindowClient.startTilingOrTabbing({ waitForIdentifier: true, componentType: pin.component });
		// 	e.dataTransfer.setData('text/plain', JSON.stringify(data));
		// } else {
		e.dataTransfer.setData('text/plain', JSON.stringify(pin));
		// }

		console.log('dragstart', pin);
	}

	onDragOver(e, pin) {
		/*if (this.tiling && this.tiling.state != "paused") {
			console.log("pause tiling on drag over");
			FSBL.Clients.WindowClient.cancelTilingOrTabbing();
			this.tiling.state = "paused";
		}*/
		e.preventDefault();
	}

	onMouseLeave(e) {
		/*if (this.tiling && this.tiling.state == "paused") {
			console.log("start tiling on mouse leave");
			if (FSBL.Clients.WindowClient.startTilingOrTabbing) FSBL.Clients.WindowClient.startTilingOrTabbing({ waitForIdentifier: true, componentType: this.tiling.pin.component });
			this.tiling.state = "started";
		}*/
	}

	onDrag(e, pin) {
		//console.log('drag', pin, e.screenX, e.screenY );
	}

	onDragEnd(e, pin) { //If no drop happened, then we need to spawn component if required
		if (this.dragging) {
			if (pin.type == 'componentLauncher' && this.tiling) {
				let spawnParams = Object.assign({}, pin.params);
				spawnParams.top = e.screenY;
				spawnParams.left = e.screenX;
				spawnParams.position = 'virtual';
				if (!spawnParams.options) spawnParams.options = {};
				spawnParams.options.autoShow = false;
				delete spawnParams.monitor;
				if (!this.mouseInWindow({
					x: e.screenX,
					y: e.screenY
				})) {
					FSBL.Clients.LauncherClient.spawn(pin.component, spawnParams, (err, response) => {
						if (FSBL.Clients.WindowClient.sendIdentifierForTilingOrTabbing) FSBL.Clients.WindowClient.sendIdentifierForTilingOrTabbing({ windowIdentifier: response.windowIdentifier });
						console.log('send identifier for tiling/tabbing');
						FSBL.Clients.RouterClient.publish('Finsemble.' + this.draggedGuid, response.windowIdentifier);
						this.dragging = false;
						if (FSBL.FinsembleWindow) FSBL.FinsembleWindow.wrap(response.windowIdentifier, (err, wrappedWindow) => { //make sure no invisible windows
							wrappedWindow.show();
						});
					});
					if (FSBL.Clients.WindowClient.stopTilingOrTabbing) FSBL.Clients.WindowClient.stopTilingOrTabbing();
					console.log('stop tiling on drag end');
				} else {
					if (FSBL.Clients.WindowClient.cancelTilingOrTabbing) FSBL.Clients.WindowClient.cancelTilingOrTabbing();
					console.log('cancel tiling on drag end');
					this.dragging = false;
				}
				this.tiling = null;
			}
			this.dragging = false;
		}
		console.log('dragend', pin);
	}

	onDrop(e, pin) {
		if (pin.type == 'componentLauncher' && this.tiling) {
			this.tiling = null;
			console.log('cancel tiling on drop');
			if (FSBL.Clients.WindowClient.cancelTilingOrTabbing) FSBL.Clients.WindowClient.cancelTilingOrTabbing();
		}
		let sourcePinData = JSON.parse(e.dataTransfer.getData('text'));
		let pins = [];
		for (var i = 0; i < this.state.pins.length; i++) {
			pins[i] = this.state.pins[i];
		}

		// remove pin
		let sourcePin = pins.splice(sourcePinData.index, 1)[0];
		console.log('drop', pin, sourcePin);

		// reinsert in proper position
		pins.splice(pin.index, 0, sourcePin);

		// reset all the indexes after reorder
		for (var i = 0; i < pins.length; i++) {
			pins[i].index = i;
		}

		this.processPins(null, { value: pins });
		//this.pinStore.setValue({ field: 'pins', value: pins });


	}

	/**
	 * A convenience function to keep the render function semi-readable.
	 * This iterates through each pin and figures out what kind of component it is. If the section is arrangeable, it renders finsembleDraggables.
	 */
	renderpins() {
		if (!this.state.pins) { return []; }
		var components = [];
		for (let i = 0; i < this.state.pins.length; i++) {
			let pin = this.state.pins[i];
			if (!pin) continue;
			let Component = this.props.pinnableItems[pin.type];
			let cmp;

			switch (pin.type) {
			case 'componentLauncher':
				cmp = <Component key={i} iconClasses="pinned-icon" buttonType={['AppLauncher', 'Toolbar']} {...pin} />;
				break;
			default:
				cmp = <Component key={i} {...pin} />;
				break;
			}

			if (this.props.arrangeable) {
				components.push(
					//Wrap the component with a FinsembleDraggable.
					<div
						draggable={true}
						onDragStart={(e) => {
							this.onDragStart(e, pin);
						}}
						onDrag={(e) => {
							this.onDrag(e, pin);
						}}
						onDragEnd={(e) => {
							this.onDragEnd(e, pin);
						}}
						onDrop={(e) => {
							this.onDrop(e, pin);
						}}
						onDragOver={(e) => {
							this.onDragOver(e, pin);
						}}
						className="fullHeightFlex"
						key={i}>
						{cmp}
					</div>);
			} else {
				components.push(cmp);
			}
		}
		return components;
	}


	componentDidMount() {
		window.addEventListener('resize', this.handleResize);
		var self = this;
		if (this.props.handleOverflow) {
			// overflow handling
			if (this.props.overflowMenuComponent) {
				this.state.overflowMenuComponent = this.props.overflowMenu;
				this.state.overflowMenuProps = this.props.overflowMenuProps;
			} else {
				this.state.overflowMenuComponent = FinsembleButton;
				this.state.overflowMenuProps = {
					buttonType: ['Toolbar', 'MenuLauncher'],
					menuType: 'Overflow Menu',
					title: 'More...',
					fontIcon: 'ff-chevron-down',
					preSpawn: true
				};
			}

			var overflowMenuStoreName = this.props.overflowMenuStoreName || 'OverflowMenuStore';

			// create/get a store for checking if overflowmenu has been spawned. If not, spawn
			FSBL.Clients.DistributedStoreClient.createStore({ global: true, store: overflowMenuStoreName }, function (err, store) {
				self.setState({ overflowStore: store });
			});

			// listener for overflow clicks
			FSBL.Clients.RouterClient.addListener(this.state.clickChannel, function (err, response) {
				//Triggered if the user reordered the overflow items.
				if (response.data.changeEvent) {
					self.reorderPins(response.data.changeEvent);
				} else {
					//Triggered if the user tries to launch an item.
					self.triggerClick(response.data.index);
				}
			});
		}

		if (this.props.handlePins) {
			FSBL.Clients.DistributedStoreClient.getStore({ global: true, store: 'Finsemble-Toolbar-Store' }, function (err, store) {
				// Load pins from storage
				self.setState({ pinStore: store });
				FSBL.Clients.StorageClient.get({ topic: 'finsemble', key: 'toolbarPins' }, function (err, pins) {
					store.setValue({ field: 'pins', value: pins });
					self.initialLoad = true;
				});
				store.addListener({ field: 'pins' }, self.processPins);
			}, () => {
				self.saveButtonsToOverflowStore(null, self);
			});
		}

	}


	componentWillUnmount() {
		window.removeEventListener('resize', this.handleResize);
		self.state.pinStore.removeListener({ field: 'pins' }, self.processPins);
	}

	/**
	 * Render method. It's very complicated.
	 * If there's an overflow component, we calculate which items in the section should be rendered, and which should be shuttled off to the overflowMenu.
	 * This code is very tied to the center-section in a toolbar that allows for pinned components, workspaces, and groups of components. We will eventually abstract that a bit.
	 */
	render() {
		let classes = this.props.className || '';
		classes += ` ${SECTION_BASE_CLASS}`;

		this.children = this.props.handlePins ? this.renderpins() : this.props.children;
		var OverflowComponent = this.state.overflowMenuComponent;
		var self = this;
		//section doesn't get rendered when it's so narrow that the first item would be clipped.
		if (self.state.minOverflowIndex === 0) return <span></span>;



		var section = (<div className={classes} ref={(e) => { this.element = e; }} onMouseLeave={(e) => this.onMouseLeave(e)}>
			{Array.isArray(this.children) && this.children.map((item, index) => {
				if (!isNaN(self.state.minOverflowIndex) && index >= self.state.minOverflowIndex) {
					var comps = [];
					// render the overflow component
					if (index == self.state.minOverflowIndex) {
						comps.push(<OverflowComponent {...self.state.overflowMenuProps} key={'overflow' + index} />);
					}
					// render the rest of the components hidden
					comps.push(<div key={index} style={{ display: 'none' }}>{item}</div>);
					if (self.element && !self.element.className.includes('overflow')) self.element.className += ' overflow';
					return comps;
				} else {
					if (self.element && self.element.className.includes('overflow')) self.element.className = self.element.className.replace('overflow', '');
					return item;
				}
			})}
		</div>);
		//If we can arrange the items, we need to wrap it in a droppable.
		//@todo eventually we may allow vertical toolbars. When that happens this direction will need to be dynamic.
		/*if (this.props.arrangeable) {
			return (<FinsembleDroppable classes={classes} direction="horizontal" droppableId="droppable">
				{section}
			</FinsembleDroppable>);
		} else {
			return section;
		}*/

		return section;

	}
}