/**************************************************************************************/
/* generic Popup system																  */
/* Copyright (c) 2026 Frank-Peter Schmidt-Lademann									  */
/* Licensed under the MIT license. See LICENSE file in the project root for details.  */
/**************************************************************************************/

/********************************************************************************************/
// Toolset for popup windows
// Each instance provides support for a single popup window at a time.
// befor opening the next popup the current popup will be closed.
// multiple instances allow for multiple popup windows.
/********************************************************************************************/

class popupSet {
	static #popupElementsID = "popupElements";  // ID of the HTML template element for the popup elements
	instanceID = "";							// ID of the instance
	instanceIdx = 0;							// externally used number to organize instances e.g. in array, will be used for z level
	zLevel;										// zLevel of instance
	callback = null;							// function called on final popdown
	#modalActive = false;						// if true popup is visible
	#modalLock = false;							// lock popup operations during delayed operations
	#modalRepeatLock = false;					// refresh lock during delayed operations
	#lastTarget = null;							// last click element to detect back to back clicks on same element for pop downs
	#lastType = "";								// last type for refresh
	#lastParamSet = null;						// for refresh
	#DOMnode = null;							// pointer to location in DOM for removing instance related nodes in DOM
	#modal = null;								// DOM node of current popup
	
	eventHdlr = function(){};					// function passed to event handler
	refreshEventHdlr = function(){};			// function passed to event handler
	#cleanup = null;							// function for type specific cleanup when popdown


	/* type specific variables with life time during existance of instance */

	
	// called at instance creation. 
	// each instance requires a different id which is used to identify the related nodes in the DOM
	// index specifies the z coordinate (overlap) of each instance 
	// callback may hold a function(this,action)
	//          the callback will be called on popdown (action="popdown" and click on popup element (action="toTop")
	//          on popdown the callback can implement a cleanup like calling destructor below and remove links to instance
	//          on  click on element the popup elementt could be brought to top or poped down. 
	constructor(id,index=0,callback=null) {
		this.instanceID = id;
		this.zLevel = this.instanceIdx = index;
		this.callback = callback;
		const el = document.getElementById(popupSet.#popupElementsID).content.cloneNode(true);
		const sectionEl = el.querySelector("#" + popupSet.#popupElementsID + "Section");
		sectionEl.id = this.instanceID;
		
		document.body.appendChild(el);
		this.#DOMnode = document.body.lastChild;
		//this.#DOMnode = document.getElementById(this.instanceID);

		// hide all popup elements and set position property to fixed
		const modalList = this.#DOMnode.querySelectorAll("section > div");
		modalList.forEach((div) => {
			// div.style.cssText = `display: none; position: fixed; opacity: 0; z-index: ${this.zLevel};`;
			
			div.style.display = "none";
			div.style.position = "fixed";
			div.style.opacity = 0;
			div.style.zIndex = this.zLevel;
			
		});
        		
		// used in add/remove eventhandler where we need matching functions
		this.eventHdlr = this.modalClick.bind(this);
		this.refreshEventHdlr = this.modalRefresh.bind(this);
		this.popupClickHdlr = this.popupClick.bind(this);
		this.#DOMnode.addEventListener("click", this.popupClickHdlr);
	}
	
	// removes instance related nodes in DOM and all links to it
	// should only be called by the instance manager that then makes this instance unaccessible
	destructor() {
		// remove all links
		this.modalClick(); // deactivate eventlisteners
		this.#DOMnode.removeEventListener("click", this.popupClickHdlr);
		this.#modal = null;
		// remove cloned fragment
		//document.body.removeChild(this.#DOMnode);
		this.#DOMnode.remove();
		this.#DOMnode = null;
	}
	
	// shift popup to a different level e.g. to bring it on top
	chgLevel(id,index) {
		this.#DOMnode.id = this.instanceID = id;
		this.zLevel = this.instanceIdx = index;
		this.#modal.style.zIndex = this.zLevel;
	}
	
	// returns true if popup active for passed event or element
	isSameTarget(obj) {
		return this.#modalActive && (typeof obj.target == 'object' ? obj.target : obj) == this.#lastTarget;
	}
	
	/* compile css property string for display, position, any other properties */
	#cssShowAt(display, top, left, width, height, moreProperties) {
		// string interpolation ${} requires backticks (template literal)
		var style = `display: ${display}; position: fixed; opacity: 1; z-index: ${this.zLevel}; `;
		style += `top:${top.toString()}px; left:${left.toString()}px; `;
		if (width != null) style += `width:${width.toString()}px; height:${height.toString()}px; `;
		if (moreProperties != null) style += moreProperties;
		return style;
	}
	
	// returns close button of passed DOM popup element 
	// null is returned if no close button exists
	static #closeBtn(e) {
		return e ? e.querySelector(".closeBtn") : null;
	}
	/* used when looping though close buttons for setting or removing listeners */
	#closeBtnAddListener (btn) {
		if(btn) btn.addEventListener("click", this.eventHdlr);
	}

	#closeBtnRemListener (btn) {
		if(btn) btn.removeEventListener("click", this.eventHdlr);
	}
	
	// checks if a specific element of the optional parameter set array is defined
	static #chkParam (paramSet, idx) {
		return paramSet != null && typeof paramSet[0] !== "undefined" && paramSet[0] != null;
	}
	
	/*******************************************************************************************/
	/* central function for popup and popdown of the various modal types                       */
	/* event: event object(e.g. event) or element object(e.g. this)                            */
	/*        preferrably if possible pass "event" to allow stopping event propagation         */
	/* type: img: zoom image from element, paramSet[0] max height in px                        */
	/* type: wiki: provide info from wiki object, paramSet[0] is key, if null key taken from element */
	/* type: feedback: give feedback, paramSet[0] feedback text, paramSet[1] uptime            */
	/* paramSet: additional information depending on type as array of parameters or any object */
	/* type: empty: remove popup                                                               */
	/* only one popup at a time per instance, a second popup will replace the current popup    */
	/*******************************************************************************************/
	modalClick(event=null, type="", paramSet=null) {
		var element = null;		// the element that was clicked on either as passed or derived as target from ckick event
		var clickPos = null;	// click location in window if a click event object is passed

		if (this.#modalLock) return; /* no interference during animation delays */

		// if called with event object get related element
		if (event != null) {
			if (typeof event.target == 'object' && event.target !== '_self') { /* called with event object */
				element = event.target;
				if(event.type == "click") clickPos = {"x" : event.clientX, "y" : event.clientY};
				event.stopPropagation(); /* try to not interfere with other events */
			} else { /* called with element object */
				element = event;
			}
		}

		// close active popup if it exists
		if (this.#modalActive) { /* modal is open, we remove the popup either for podown or next popup*/

			if (window.getSelection().type == "Range" && type == "") return; /* do not popdown when selecting in modal */
			// first remove all eventlisteners or pending actions
			if (this.#cleanup) this.#cleanup(); // type specific cleanup
			this.#cleanup = null; // clear cleanup
			document.body.removeEventListener("click", this.eventHdlr);
			window.matchMedia("(orientation: portrait)").removeEventListener("change",this.refreshEventHdlr);
			this.#closeBtnRemListener(popupSet.#closeBtn(this.#modal));
			
			this.#modalActive = false;
			if(this.#modal != null) { // possibly it has already been destructed
				if (type == "" || (element == this.#lastTarget && clickPos != null)) {
					/* popdown event or clicking on same target  popdown modal */
					//this.#lastTarget = null;
					this.#modal.style.opacity = 0;
					this.#modalLock = true; 
					setTimeout(function(){ // delay final popdown to allow for animation
					    if(this.#modal != null) {
							this.#modal.style.display = "none";
							this.#modal = null;
							if(this.callback) this.callback(this,"popdown");
						}
						this.#modalLock = false;
					}.bind(this), 500);
					return; /* This was a pure popdown, we are done */
				}
				/* clicking on different Target popdown without animation before popup of other content */
				this.#modal.style.display = "none";
				this.#modal = null;
			}
			this.#lastTarget = null;
		}
		if (type == "" || element == null) return; // we catch multiple pop down events
		
		// prepare for  popup
		
		if(this.#DOMnode == null) { // make sure we have a DOM object that we can popup
			console.log("PopupSet: instance with missing DOM object that we can popup");
			return;
		}
		this.#lastTarget = element; /* detect click on same target and remember for repeat */
		this.#lastType = type;
		// to determine content and position of the popup the following information is available:
		// element: holds the clicked DOM object (position, image url, content)
		// type: passed type of the popup depending on customization
		// paramSet[0] and paramSet[1] optional additional passed values e.g. content for the popup
		// clickPos: click position on screen x,y if not null
		// window.innerWidth, window.innerHeight: screen window dimensions
		// first get position and dimensions of clicked element
		var vpOffset = element.getBoundingClientRect();
		var elTop = vpOffset.top;
		var elLeft = vpOffset.left;
		var elBottom = vpOffset.bottom;
		var elWidth = vpOffset.width;
		var elHeight = vpOffset.height;
		// get screen dimensions
		const vpWidth = document.body.clientWidth; //minus scrollbar
		//const vpWidth = window.innerWidth; // including scrollbar
		const vpHeight = window.innerHeight;
		// click position if not null: clickPos.x, clickPos.y may be available too
		// configure popup depending on type
		switch(type) {
			case "image" : {
				// do image zoom popup, paramSet{0] is maximum height, if null maximum height is image height
				// image to popup is taken from clicked object element
				const imgModal = this.#DOMnode.querySelector("#imgModal")
				const imgurl=element.src;
				const imgHeight=element.naturalHeight;
				const imgWidth=element.naturalWidth;
				this.#modal = imgModal;
				/* first place modal on small image */
				this.#modal.style.cssText = this.#cssShowAt("block",elTop,elLeft,elWidth,elHeight,"background-image: url('" + imgurl + "'); ");
				
				/* calculate sizes of zoomed image */
				const maxHeight = !popupSet.#chkParam(paramSet,0) ? imgHeight : paramSet[0];
				this.#lastParamSet = [maxHeight]; /* remember for repeat */
				const capRatio=Math.min((vpWidth-24)/(imgWidth),Math.min(vpHeight-16,maxHeight)/imgHeight/*,1*/); /*choose smallest ratio less than 1*/

				/* scale image */
				const width=Math.floor(imgWidth*capRatio);
				const height=Math.floor(imgHeight*capRatio);
				/* position in center of viewport */
				const leftOffset=Math.floor((vpWidth-width)/2)-2;
				const topOffset=Math.floor((vpHeight-height)/2)-2;
				const style = this.#cssShowAt("block",topOffset,leftOffset,width,height,"background-image: url('" + imgurl + "'); ");
				this.#modalLock = true; 
					setTimeout(function(){
						this.#modal.style.cssText = style;
						this.#modalLock = false;
					}.bind(this), 100); /* zoom animated */
				break; 
			} 
			case "wiki" : {
				/* do word explanation popup paramSet[0] is keyword, if null use clicked text*/
				const txtModal = this.#DOMnode.querySelector("#txtModal");
				const modalHdr = txtModal.querySelector("#modalHdrTxt");
				const modalBdy = txtModal.querySelector("#modalBdyTxt");
				const wikiDB = wiki;
				let keyword = "";
				if (!popupSet.#chkParam(paramSet,0)) keyword = element.textContent; else keyword = paramSet[0];
				this.#lastParamSet = [keyword]; /* remember for repeat */
				this.#modal = txtModal;
				modalHdr.textContent = keyword;
				modalBdy.innerHTML = wikiDB.explain(keyword);
				this.#modal.style.display = "block";
				modalBdy.scrollTop=0; 
				const modalHeight = this.#modal.offsetHeight;
				const modalWidth = this.#modal.offsetWidth + 20;
				const modalTop = Math.max(2,elTop < (vpHeight/2) ? Math.min(vpHeight - modalHeight - 4, elBottom + 4) : Math.max(4, elTop - modalHeight - 4));
				const modalLeft = Math.max(8,elLeft + Math.min(-8,vpWidth-(elLeft+modalWidth)));
				//modal.scrollTop=0; //activating the scrolled modal again it maintains old scroll position 
				//writeLog(`wiki: screen: ${vpWidth}/${vpHeight}\r\ntarget: ${elLeft}/${elTop}\r\nmodal: ${modalLeft}/${modalTop}`);
				this.#modal.style.cssText = this.#cssShowAt("block",modalTop,modalLeft);
				break; 
			}
			case "feedback" : {
				/* give feedback on click action. paramSet[0] is feedback message. paramSet[1] is Message up time */
				const fbModal = this.#DOMnode.querySelector("#fbModal");
				this.#modal = fbModal;
				this.#modal.innerText = paramSet[0];
				this.#modal.style.display = "inline-block";
				const modalHeight = this.#modal.offsetHeight;
				const modalWidth = this.#modal.offsetWidth + 20;
				let x, y;
				if (clickPos) {
					/* modalClick(event,...) popup displayed near click position */
					x = clickPos.x;
					y = clickPos.y;
				} else {
					/* modalClick(this,...) popup displayed in center of viewpoint */
					x = vpWidth/2;
					y = vpHeight/2;
				}
				const modalTop = Math.max(4, y - modalHeight - 12);
				const modalLeft = Math.max(8,x + Math.min(-8,vpWidth-(x+modalWidth)));
				this.#modal.style.cssText = this.#cssShowAt("inline-block",modalTop,modalLeft);
				const fbCloseId = setTimeout(function(){this.modalClick();}.bind(this), popupSet.#chkParam(paramSet,0) ? paramSet[1] : 2000);
				// in case popup is closed before timeout clear timeout
				this.#cleanup = function (id){
					clearTimeout(id);
				}.bind(this,fbCloseId);
				break;
			}
			case "iframe" : {
				const ifModal = this.#DOMnode.querySelector("#iframe");
				const modalHdr = ifModal.querySelector("#modalHdrTxt");
				const ifElement = ifModal.querySelector("#iframe-obj");
				const ifWidth = 300;
				const ifHeight = 150;
				this.#modal = ifModal;
				const capRatio=Math.min((vpWidth-24)/ifWidth,(vpHeight-16)/ifHeight); //choose smallest ratio less than 1

				// scale image
				const width=Math.floor(ifWidth*capRatio);
				const height=Math.floor(ifHeight*capRatio);
				//position in center of viewport
				const leftOffset=Math.floor((vpWidth-width)/2)-2;
				const topOffset=Math.floor((vpHeight-height)/2)-2;
				if(popupSet.#chkParam(paramSet,0)) modalHdr.textContent = ifElement.src = paramSet[0];
				this.#modal.style.cssText = this.#cssShowAt("block",topOffset,leftOffset,width,height);
				break;
			}
			case "log" : {
				// a popup window for logging debug information, complete log to be displayed passed in paramSet[0]
				const logModal = this.#DOMnode.querySelector("#jslog");
				this.#modal = logModal;
				this.#modal.innerText = paramSet[0];
				this.#modal.scrollTop = this.#modal.scrollHeight; // scroll to end
				this.#modal.style.cssText = this.#cssShowAt("block",10,10);
				break;
			}
			default: {
				break;
			}
		}
		this.#modalActive = true;
		
		// finaly provide eventhandlers for clicking on body, orientation change and close button
		setTimeout(function(){
			document.body.addEventListener("click", this.eventHdlr);
		}.bind(this),100); /* click anywhere popdown modal, delay to not catch this event */
		window.matchMedia("(orientation: portrait)").addEventListener("change",this.refreshEventHdlr);
		this.#closeBtnAddListener(popupSet.#closeBtn(this.#modal));
	}

	//refresh after changing orientation of screen
	modalRefresh(event) {
		var element = this.#lastTarget;
		if (this.#modalRepeatLock || element == null) return; /* only handle one of multiple events fired when orientation is changed */

		event.stopPropagation();
		if(!this.#modalActive) return; // stop if already poped down
		//console.log("modal refresh");
		this.#modalRepeatLock = true;

		
		this.#lastTarget = null; /* do not popdown because of same target */

		switch(this.#lastType) {
			case "image" : {this.modalClick(element, this.#lastType, this.#lastParamSet); break;}
			case "wiki" : {this.modalClick(element, this.#lastType, this.#lastParamSet); break;}
			case "feedback" : { break;}
			case "log" : { break;}
		}
		setTimeout(function(){this.#modalRepeatLock = false;}.bind(this),200); /* wait for a while until all events for one orientation change have been fired */
	}
	
	// handle a click on the popup by handing to callback function if provided
	popupClick(event) {
		event.stopPropagation();
		console.log("click on modal");
		if (window.getSelection().type == "Range") return; // This was marking some text in the popup
		if(this.callback) this.callback(this,"toTop");
	}
	
	// writes new content in the log window, we avoid using modlaClick() again risking recursive logging
	writeLog(logTxt) {
		if (this.#lastType == "log") {
			this.#modal.innerText = logTxt;
			this.#modal.scrollTop = this.#modal.scrollHeight;
		}
	}

}

// manages families of popups
class popupMgr{
	#family;
	#zBase;
	#popupStack;
	#popupMgrCallback;
	
	// specify a base name for the DOM id (family) and the starting z index for this family (zBase)
	constructor(family, zBase) {
		this.#family = family;
		this.#zBase = zBase;
		this.#popupStack = {};
		this.#popupMgrCallback = this.popupCallback.bind(this);
	}
	
	#levelToId(level) {
		return this.#family + level;
	}

	// frontend to popup System
	// manages a popup stack with popup instances
	// level = 0 creates a popupinstance at the specified base z index for this popup family
	// level > 0 will create a popup instance at the specified z level
	// level = -1 creates a new instance at a higher level than all others and does a popup
	// if no popup type is given, all popups are closed and instances removed
	popupClick(event=null, level = -1, type="", paramSet=null) {
		var keyList = Object.keys(this.#popupStack);
		var idx;

		if(event && typeof event.stopPropagation === "function") event.stopPropagation();
		// close all popups if no type given
		if(type == "") {
			this.popupClose();
			return;
		}
		
		if(level == 0 ) level = this.#zBase;
		
		// level = -1 function finds a new level for this popup on top of all others
		if(level == -1 ) {
			level = (keyList.length ? Math.max(...keyList,this.#zBase) : this.#zBase) + 1;
			// don't create a new level for an already existin popup
		}
		
		Object.keys(this.#popupStack).forEach(function(idx) {
			if(this.#popupStack[idx].isSameTarget(event)) level = idx;
		}.bind(this));
		
		// create instance for this level if not existant
		if(!Object.hasOwn(this.#popupStack, level)){
			this.#popupStack[level] = new popupSet(this.#levelToId(level), level, this.#popupMgrCallback);
		}
		
		// do the popup for this instance
		this.#popupStack[level].modalClick(event,type,paramSet);

	}

	popupCallback (instance, action = "popdown") {
		if(action == "popdown") this.popupClose(instance);
		else this.popupToTop(instance);
	}

	// removes an instance freeing up space if no instance given all popups are cleared
	popupClose(instance=null) {
		if(instance) {
			var level = instance.instanceIdx;
			instance.destructor();
			delete this.#popupStack[level];
			return;
		} else {
			var idx;
			Object.keys(this.#popupStack).forEach(function(idx) {
				this.#popupStack[idx].destructor();
			}.bind(this));
			this.#popupStack = {};
		}
	}

	popupToTop(instance){
		var keyList = Object.keys(this.#popupStack);
		var topLevel = Math.max(...keyList);
		var curLevel = instance.instanceIdx;
		var newLevel = topLevel+1;
		if(curLevel == topLevel) {
			this.popupClose(instance);
		} else {
			this.#popupStack[newLevel] = this.#popupStack[curLevel];
			delete this.#popupStack[curLevel];
			this.#popupStack[newLevel].chgLevel(this.#levelToId(newLevel),newLevel);
		}
	}
	
}
