### Popup Framework In Vanilla Javascript



#### Features



&#x20;   • highly customizable

&#x20;       ◦ any number of different popup templates can be created using html/css

&#x20;       ◦ the behaviour of each popup can be customized at a well defined area of the script

&#x20;   • nested popups

&#x20;   • one popup instance handles one popup at the time but allows to switch between different popups and already provides basic functionality

&#x20;   • refresh of popus is provided on orientation change allowing adjustment of position and size

&#x20;   • multiple popups including nested popups can be implemented by creating multiple instances

&#x20;   • a manager is provided to handle a popup family where an unlimited number of popups can be handled allowing the user to individually popup and down each popup, remove all at once and to bring each one to the top. Each popup will be at a different z-level

&#x20;   • additionaly multiple popup families can be created.



The basic implementation uses dynamic creation and removal of DOM objects from a template (html template tag) as well as switching visibility using the css display property. Each popup object is imbedded in an instance of the javascript class popupSet.



#### Components



The system consists of three components.

&#x20;   1. An HTML/CSS part where the template for the different popup elements are defined. Any popup form can be defined.

&#x20;   2. The javascript class popupSet with the basic functionality for the popup/popdown of the popups defined in the template.

&#x20;   3. The optional javascript class popupMgr to dynamically handle multiple concurrent popups.





#### Documentation



A reference description is provided in the file **popup\_framework.odt**.



#### Execution



copy the files:

* **popup-demo.html**
* popup\_lib.js
* popup\_lib.css
* rehe.jpg
* eichhorn.jpg
* hasen.jpg

in a directory and open popup.html in a browser.





#### Files



###### Framework

|File name|Content|
|-|-|
|popup\_lib.js|popup JavaScript classes|
|popup\_lib.css|popup styling|
|popup\_complete.html|popup templates with includes for above files|
|popup\_framework.odt|documentation|



###### Demo

|File name|Content|
|-|-|
|popup-demo.html|demo of popups using above framework, requires popup\_lib.js and popup\_lib.css|
|eichhorn.jpg, hasen.jpg, rehe.jpg|used in demo for zoom up popups|



