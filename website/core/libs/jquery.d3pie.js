/*!
 * d3pie jQuery plugin
 * @author Ben Keen
 * @version 0.1.0
 * @date Feb 2014
 * http://github.com/benkeen/d3pie
 */
;(function($, window, document) {
	"use strict";

	var _pluginName = "d3pie";

	// include: [DEFAULT SETTINGS]

	// -------------------------------

	// to be populated when each item is first rendered on the canvas
	var computedSizes = {
		title: { h: 0, w: 0 },
		subtitle: { h: 0, w: 0 },
		topHeaderGroup: { h: 0, w: 0 }
	};

	var _pieMetadata = {
		totalSize: 0,
		innerRadius: 0,
		outerRadius: 0,
		hasTitle: false,
		hasSubtitle: false,
		hasFooter: false
	};

	var _arc, _svg,  _options;
	var _offscreenCoord = -10000;


	// -------------------------------


	// our constructor
	function d3pie(element, options) {
		this.element = element;
		this.options = $.extend(true, {}, _defaultSettings, options);

		// confirm d3 is available [check minimum version]
		if (!window.d3 || !window.d3.hasOwnProperty("version")) {
			console.error("d3pie error: d3 is not available");
			return;
		}

		// validate here

		this._defaults = _defaultSettings;
		this._name = _pluginName;

		// now initialize the thing
		this.init();
	}

	// prevents multiple instantiations of the same plugin on the same element
	$.fn[_pluginName] = function(options) {
		return this.each(function() {
			if (!$.data(this, _pluginName)) {
				$.data(this, _pluginName, new d3pie(this, options));
			}
		});
	};


	// ----- public functions -----

	d3pie.prototype.destroy = function() {
		$(this.element).removeData(_pluginName); // remove the data attr
		$(this.element).html(""); // clear out the SVG
		//delete this.options;
	};

	d3pie.prototype.recreate = function() {
		$(this.element).html("");
		this.init();
	};


	// this let's the user dynamically update aspects of the pie chart without causing a complete redraw. It
	// intelligently re-renders only the part of the pie that the user specifies. Some things cause a repaint, others
	// just redraw the single element
	d3pie.prototype.updateProp = function(propKey, value, optionalSettings) {
		switch (propKey) {
			case "header.title.text":
				var oldValue = _processObj(this.options, propKey);
				_processObj(this.options, propKey, value);
				$("#title").html(value);
				if ((oldValue === "" && value !== "") || (oldValue !== "" && value === "")) {
					this.recreate();
				}
				break;

			case "header.subtitle.text":
				var oldValue = _processObj(this.options, propKey);
				_processObj(this.options, propKey, value);
				$("#subtitle").html(value);
				if ((oldValue === "" && value !== "") || (oldValue !== "" && value === "")) {
					this.recreate();
				}
				break;

			case "callbacks.onload":
			case "callbacks.onMouseoverSegment":
			case "callbacks.onMouseoutSegment":
			case "callbacks.onClickSegment":
				_processObj(this.options, propKey, value);
				break;
		}
	};


	// ----- private functions -----


	d3pie.prototype.init = function() {
		_options = this.options;

		// 1. Prep-work
		_sortPieData();
		_addSVGSpace(this.element);

		_pieData.hasTitle    = _options.header.title.text !== "";
		_pieData.hasSubtitle = _options.header.subtitle.text !== "";
		_pieData.hasFooter   = _options.footer.text !== "";

		// 2. add all text components offscreen. We need to know their widths/heights for later computation
		_addTextElementsOffscreen();
		_addFooter(); // the footer never moves- just put it in place now.

		// 3. now we have all the data we need, compute the available space for the pie chart
		_computePieRadius();

		// position the title + subtitle. These two are interdependent
		_positionTitle();
		_positionSubtitle();

		// STEP 2: now create the pie chart and add the labels. We have to place this in a timeout because the previous
		// functions took a little time
		setTimeout(function() {
			_createPie();
			_addFilter();
			_addLabels();
			_addSegmentEventHandlers();
		}, 5);
	};


	var _addTextElementsOffscreen = function() {
		if (_hasTitle) {
			_addTitle();
		}
		if (_hasSubtitle) {
			_addSubtitle();
		}
	};

	var _computePieRadius = function() {
		// outer radius is either specified (e.g. through the generator), or omitted altogether
		// and calculated based on the canvas dimensions. Right now the estimated version isn't great - it should
		// be possible to calculate it to precisely generate the maximum sized pie, but it's fussy as heck

		// first, calculate the default _outerRadius
		var w = _options.size.canvasWidth - _options.misc.canvasPadding.left - _options.misc.canvasPadding.right;
		var h = _options.size.canvasHeight; // - headerHeight - _options.misc.canvasPadding.bottom - footerHeight);

		_outerRadius = ((w < h) ? w : h) / 2.8;

		// if the user specified something, use that instead
		if (_options.size.pieOuterRadius !== null) {
			if (/%/.test(_options.size.pieOuterRadius)) {
				var percent = parseInt(_options.size.pieOuterRadius.replace(/[\D]/, ""), 10);
				percent = (percent > 99) ? 99 : percent;
				percent = (percent < 0) ? 0 : percent;
				var smallestDimension = (w < h) ? w : h;
				_outerRadius = Math.floor((smallestDimension / 100) * percent) / 2;
			} else {
				// blurgh! TODO bounds checking
				_outerRadius = parseInt(_options.size.pieOuterRadius, 10);
			}
		}

		// inner radius
		if (/%/.test(_options.size.pieInnerRadius)) {
			var percent = parseInt(_options.size.pieInnerRadius.replace(/[\D]/, ""), 10);
			percent = (percent > 99) ? 99 : percent;
			percent = (percent < 0) ? 0 : percent;
			_innerRadius = Math.floor((_outerRadius / 100) * percent);
		} else {
			_innerRadius = parseInt(_options.size.pieInnerRadius, 10);
		}
	};

	var _sortPieData = function() {
		switch (_options.misc.dataSortOrder) {
			case "none":
				// do nothing.
				break;
			case "random":
				_options.data = _shuffleArray(_options.data);
				break;
			case "value-asc":
				_options.data.sort(function(a, b) { return (a.value < b.value) ? 1 : -1 });
				break;
			case "value-desc":
				_options.data.sort(function(a, b) { return (a.value > b.value) ? 1 : -1 });
				break;
			case "label-asc":
				_options.data.sort(function(a, b) { return (a.label.toLowerCase() > b.label.toLowerCase()) ? 1 : -1 });
				break;
			case "label-desc":
				_options.data.sort(function(a, b) { return (a.label.toLowerCase() < b.label.toLowerCase()) ? 1 : -1 });
				break;
		}
	}

	// creates the SVG element
	var _addSVGSpace = function(element) {
		_svg = d3.select(element).append("svg:svg")
			.attr("width", _options.size.canvasWidth)
			.attr("height", _options.size.canvasHeight);

		if (_options.styles.backgroundColor !== "transparent") {
			_svg.style("background-color", function() { return _options.styles.backgroundColor; });
		}
	};

	/**
	 * Adds the Pie Chart title.
	 * @param titleData
	 * @private
	 */
	var _addTitle = function() {
		var title = _svg.selectAll(".title").data([_options.header.title]);
		title.enter()
			.append("text")
			.attr("id", "title")
			.attr("x", _offscreenCoord)
			.attr("y", _offscreenCoord)
			.attr("class", "title")
			.attr("text-anchor", function() {
				var location;
				if (_options.header.location === "top-center" || _options.header.location === "pie-center") {
					location = "middle";
				} else {
					location = "left";
				}
				return location;
			})
			.attr("fill", function(d) { return d.color; })
			.text(function(d) { return d.text; })
			.style("font-size", function(d) { return d.fontSize; })
			.style("font-family", function(d) { return d.font; });
	};


	var _positionTitle = function() {
		_componentDimensions.title.h = _getTitleHeight();
		var x = (_options.header.location === "top-left") ? _options.misc.canvasPadding.left : _options.size.canvasWidth / 2;
		var y;

		if (_options.header.location === "pie-center") {

			// this is the exact vertical center
			y = ((_options.size.canvasHeight - _options.misc.canvasPadding.bottom) / 2) + _options.misc.canvasPadding.top + (_componentDimensions.title.h / 2);

			// special clause. We want to adjust the title to be slightly higher in the event of their being a subtitle
			if (_hasSubtitle) {
//				_componentDimensions.subtitle.h = _getTitleHeight();
//				var titleSubtitlePlusPaddingHeight = _componentDimensions.subtitle.h + _options.misc.titleSubtitlePadding + _componentDimensions.title.h;
				//y -= (subtitleHeight / 2);
			}

		} else {
			y = (_options.header.location === "pie-center") ? _options.size.canvasHeight / 2 : _options.misc.canvasPadding.top + _componentDimensions.title.h;
		}

		_svg.select("#title")
			.attr("x", x)
			.attr("y", y);
	};

	var _positionSubtitle = function() {
		var subtitleElement = document.getElementById("subtitle");
		var dimensions = subtitleElement.getBBox();
		var x = (_options.header.location === "top-left") ? _options.misc.canvasPadding.left : _options.size.canvasWidth / 2;

		// when positioning the subtitle, take into account whether there's a title or not
		var y;
		if (_options.header.title.text !== "") {
			var titleY = parseInt(d3.select(document.getElementById("title")).attr("y"), 10);
			y = (_options.header.location === "pie-center") ? _options.size.canvasHeight / 2 : dimensions.height + _options.misc.titleSubtitlePadding + titleY;
		} else {
			y = (_options.header.location === "pie-center") ? _options.size.canvasHeight / 2 : dimensions.height + _options.misc.canvasPadding.top;
		}

		_svg.select("#subtitle")
			.attr("x", x)
			.attr("y", y);
	};

	var _addSubtitle = function() {
		if (_options.header.subtitle.text === "") {
			return;
		}

		_svg.selectAll(".subtitle")
			.data([_options.header.subtitle])
			.enter()
			.append("text")
			.attr("x", _offscreenCoord)
			.attr("y", _offscreenCoord)
			.attr("id", "subtitle")
			.attr("class", "subtitle")
			.attr("text-anchor", function() {
				var location;
				if (_options.header.location === "top-center" || _options.header.location === "pie-center") {
					location = "middle";
				} else {
					location = "left";
				}
				return location;
			})
			.attr("fill", function(d) { return d.color; })
			.text(function(d) { return d.text; })
			.style("font-size", function(d) { return d.fontSize; })
			.style("font-family", function(d) { return d.font; });
	};

	var _addFooter = function() {
		_svg.selectAll(".footer")
			.data([_options.footer])
			.enter()
			.append("text")
			.attr("x", _offscreenCoord)
			.attr("y", _offscreenCoord)
			.attr("id", "footer")
			.attr("class", "footer")
			.attr("text-anchor", function() {
				var location;
				if (_options.footer.location === "bottom-center") {
					location = "middle";
				} else if (_options.footer.location === "bottom-right") {
					location = "left"; // on purpose. We have to change the x-coord to make it properly right-aligned
				} else {
					location = "left";
				}
				return location;
			})
			.attr("fill", function(d) { return d.color; })
			.text(function(d) { return d.text; })
			.style("font-size", function(d) { return d.fontSize; })
			.style("font-family", function(d) { return d.font; });

		_whenIdExists("footer", _positionFooter);
	};

	var _positionFooter = function() {
		var x;
		if (_options.footer.location === "bottom-left") {
			x = _options.misc.canvasPadding.left;
		} else if (_options.footer.location === "bottom-right") {
			var dims = document.getElementById("footer").getBBox();
			x = _options.size.canvasWidth - dims.width - _options.misc.canvasPadding.right;
		} else {
			x = _options.size.canvasWidth / 2;
		}

		_svg.select("#footer")
			.attr("x", x)
			.attr("y", _options.size.canvasHeight - _options.misc.canvasPadding.bottom);
	};

	var _getTotalPieSize = function(data) {
		var totalSize = 0;
		for (var i=0; i<data.length; i++) {
			totalSize += data[i].value;
		}
		return totalSize;
	};

	var _openSegment = function(segment) {

		// close any open segments
		if ($(".expanded").length > 0) {
			_closeSegment($(".expanded")[0]);
		}

		d3.select(segment).transition()
			.ease(_options.effects.pullOutSegmentOnClick.effect)
			.duration(_options.effects.pullOutSegmentOnClick.speed)
			.attr("transform", function(d, i) {
				var c = _arc.centroid(d),
					x = c[0],
					y = c[1],
					h = Math.sqrt(x*x + y*y),
					pullOutSize = 8;

				return "translate(" + ((x/h) * pullOutSize) + ',' + ((y/h) * pullOutSize) + ")";
			})
			.each("end", function(d, i) {
				$(this).attr("class", "expanded");
			});
	};

	var _closeSegment = function(segment) {
		d3.select(segment).transition()
			.duration(400)
			.attr("transform", "translate(0,0)")
			.each("end", function(d, i) {
				$(this).attr("class", "");
			});
	};

	var _arcTween = function(b) {
		var i = d3.interpolate({ value: 0 }, b);
		return function(t) {
			return _arc(i(t));
		};
	};

	var _getSegmentRotationAngle = function(index, data, totalSize) {
		var val = 0;
		for (var i=0; i<index; i++) {
			try {
				val += data[i].value;
			} catch (e) {
				console.error("error in _getSegmentRotationAngle:", data, i);
			}
		}
		return (val / totalSize) * 360;
	};

	/**
	 * Creates the pie chart segments and displays them according to the selected load effect.
	 * @param element
	 * @param options
	 * @private
	 */
	var _createPie = function() {
		_totalSize = _getTotalPieSize(_options.data);

		var pieChartElement = _svg.append("g")
			.attr("transform", _getPieTranslateCenter)
			.attr("class", "pieChart");

		_arc = d3.svg.arc()
			.innerRadius(_innerRadius)
			.outerRadius(_outerRadius)
			.startAngle(0)
			.endAngle(function(d) {
				var angle = (d.value / _totalSize) * 2 * Math.PI;
				return angle;
			});

		var g = pieChartElement.selectAll(".arc")
			.data(
				_options.data.filter(function(d) { return d.value; }),
				function(d) { return d.label; }
			)
			.enter()
			.append("g")
			.attr("class", function() {
				var className = "arc";
				if (_options.effects.highlightSegmentOnMouseover) {
					className += " arcHover";
				}
				return className;
			});

		// if we're not fading in the pie, just set the load speed to 0
		var loadSpeed = _options.effects.load.speed;
		if (_options.effects.load.effect === "none") {
			loadSpeed = 0;
		}

		g.append("path")
			.attr("id", function(d, i) { return "segment" + i; })
			.style("fill", function(d, index) { return _options.styles.colors[index]; })
			.style("stroke", "#ffffff")
			.style("stroke-width", 1)
			.transition()
			.ease("cubic-in-out")
			.duration(loadSpeed)
			.attr("data-index", function(d, i) { return i; })
			.attrTween("d", _arcTween);

		_svg.selectAll("g.arc")
			.attr("transform",
			function(d, i) {
				var angle = _getSegmentRotationAngle(i, _options.data, _totalSize);
				return "rotate(" + angle + ")";
			}
		);
	};


	/**
	 * Add the labels to the pie.
	 * @param options
	 * @private
	 */
	var _addLabels = function() {

		// 1. Add the main label (not positioned yet)
		var labelGroup = _svg.selectAll(".labelGroup")
			.data(
				_options.data.filter(function(d) { return d.value; }),
				function(d) { return d.label; }
			)
			.enter()
			.append("g")
			.attr("class", "labelGroup")
			.attr("id", function(d, i) {
				return "labelGroup" + i;
			})
			.attr("transform", _getPieTranslateCenter);

		labelGroup.append("text")
			.attr("class", "segmentLabel")
			.attr("id", function(d, i) { return "label" + i; })
			.text(function(d) { return d.label; })
			.style("font-size", "8pt")
			.style("fill", _options.labels.labelColor)
			.style("opacity", 0);

		// 2. Add the percentage label (not positioned yet)


		// 3. Add the value label (not positioned yet)

		/*
		labelGroup.append("text")
		.text(function(d) {
		return Math.round((d.value / _totalSize) * 100) + "%";
		})
		.attr("class", "pieShare")
		.attr("transform", function(d, i) {
		var angle = _getSegmentRotationAngle(d, i, _data, _totalSize);
		var labelRadius = _outerRadius + 30;
		var c = _arc.centroid(d),
		x = c[0],
		y = c[1],
		h = Math.sqrt(x*x + y*y); // pythagorean theorem for hypotenuse

		return "translate(" + (x/h * labelRadius) +  ',' + (y/h * labelRadius) +  ") rotate(" + -angle + ")";
		})
		.style("fill", options.labels.labelPercentageColor)
		.style("font-size", "8pt")
		.style("opacity", function() {
		return (options.effects.loadEffect === "fadein") ? 0 : 1;
		});
		*/

		// fade in the labels when the load effect is complete - or immediately if there's no load effect
		var loadSpeed = (_options.effects.load.effect === "default") ? _options.effects.load.speed : 1;
		setTimeout(function() {
			var labelFadeInTime = (_options.effects.load.effect === "default") ? _options.effects.labelFadeInTime : 1;
			d3.selectAll("text.segmentLabel")
				.transition()
				.duration(labelFadeInTime)
				.style("opacity", 1);

			// once everything's done loading, trigger the onload callback if defined
			if ($.isFunction(_options.callbacks.onload)) {
				setTimeout(function() {
					try {
						_options.callbacks.onload();
					} catch (e) { }
				}, labelFadeInTime);
			}

		}, loadSpeed);


		// now place the labels in reasonable locations. This needs to run in a timeout because we need the actual
		// text elements in place prior to
		setTimeout(_addLabelLines, 1);
	};


	// this both adds the lines and positions the labels
	var _addLabelLines = function() {
		var lineMidPointDistance = _options.misc.labelPieDistance - (_options.misc.labelPieDistance / 4);
		var circleCoordGroups = [];

		d3.selectAll(".segmentLabel")
			.style("opacity", 0)
			.attr("dx", function(d, i) {
				var labelDimensions = document.getElementById("label" + i).getBBox();

				var angle = _getSegmentRotationAngle(i, _options.data, _totalSize);
				var nextAngle = 360;
				if (i < _options.data.length - 1) {
					nextAngle = _getSegmentRotationAngle(i+1, _options.data, _totalSize);
				}

				var segmentCenterAngle = angle + ((nextAngle - angle) / 2);
				var remainderAngle = segmentCenterAngle % 90;
				var quarter = Math.floor(segmentCenterAngle / 90);

				var labelXMargin = 10; // the x-distance of the label from the end of the line [TODO configurable?]

				var p1, p2, p3, labelX;
				switch (quarter) {
					case 0:
						var calc1 = Math.sin(_toRadians(remainderAngle));
						labelX = calc1 * (_outerRadius + _options.misc.labelPieDistance) + labelXMargin;
						p1     = calc1 * _outerRadius;
						p2     = calc1 * (_outerRadius + lineMidPointDistance);
						p3     = calc1 * (_outerRadius + _options.misc.labelPieDistance) + 5;
						break;
					case 1:
						var calc2 = Math.cos(_toRadians(remainderAngle));
						labelX = calc2 * (_outerRadius + _options.misc.labelPieDistance) + labelXMargin;
						p1     = calc2 * _outerRadius;
						p2     = calc2 * (_outerRadius + lineMidPointDistance);
						p3     = calc2 * (_outerRadius + _options.misc.labelPieDistance) + 5;
						break;
					case 2:
						var calc3 = Math.sin(_toRadians(remainderAngle));
						labelX = -calc3 * (_outerRadius + _options.misc.labelPieDistance) - labelDimensions.width - labelXMargin;
						p1     = -calc3 * _outerRadius;
						p2     = -calc3 * (_outerRadius + lineMidPointDistance);
						p3     = -calc3 * (_outerRadius + _options.misc.labelPieDistance) - 5;
						break;
					case 3:
						var calc4 = Math.cos(_toRadians(remainderAngle));
						labelX = -calc4 * (_outerRadius + _options.misc.labelPieDistance) - labelDimensions.width - labelXMargin;
						p1     = -calc4 * _outerRadius;
						p2     = -calc4 * (_outerRadius + lineMidPointDistance);
						p3     = -calc4 * (_outerRadius + _options.misc.labelPieDistance) - 5;
						break;
				}
				circleCoordGroups[i] = [
					{ x: p1, y: null },
					{ x: p2, y: null },
					{ x: p3, y: null }
				];

				return labelX;
			})
			.attr("dy", function(d, i) {
				var labelDimensions = document.getElementById("label" + i).getBBox();
				var heightOffset = labelDimensions.height / 5;

				var angle = _getSegmentRotationAngle(i, _options.data, _totalSize);
				var nextAngle = 360;
				if (i < _options.data.length - 1) {
					nextAngle = _getSegmentRotationAngle(i+1, _options.data, _totalSize);
				}
				var segmentCenterAngle = angle + ((nextAngle - angle) / 2);
				var remainderAngle = (segmentCenterAngle % 90);
				var quarter = Math.floor(segmentCenterAngle / 90);
				var p1, p2, p3, labelY;

				switch (quarter) {
					case 0:
						var calc1 = Math.cos(_toRadians(remainderAngle));
						labelY = -calc1 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = -calc1 * _outerRadius;
						p2     = -calc1 * (_outerRadius + lineMidPointDistance);
						p3     = -calc1 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
					case 1:
						var calc2 = Math.sin(_toRadians(remainderAngle));
						labelY = calc2 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = calc2 * _outerRadius;
						p2     = calc2 * (_outerRadius + lineMidPointDistance);
						p3     = calc2 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
					case 2:
						var calc3 = Math.cos(_toRadians(remainderAngle));
						labelY = calc3 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = calc3 * _outerRadius;
						p2     = calc3 * (_outerRadius + lineMidPointDistance);
						p3     = calc3 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
					case 3:
						var calc4 = Math.sin(_toRadians(remainderAngle));
						labelY = -calc4 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = -calc4 * _outerRadius;
						p2     = -calc4 * (_outerRadius + lineMidPointDistance);
						p3     = -calc4 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
				}
				circleCoordGroups[i][0].y = p1;
				circleCoordGroups[i][1].y = p2;
				circleCoordGroups[i][2].y = p3;

				return labelY;
			});

		var lineGroups = _svg.insert("g", ".pieChart")
			.attr("class", "lineGroups")
			.style("opacity", 0);

		var lineGroup = lineGroups.selectAll(".lineGroup")
			.data(circleCoordGroups)
			.enter()
			.append("g")
			.attr("class", "lineGroup")
			.attr("transform", _getPieTranslateCenter);

		var lineFunction = d3.svg.line()
			.interpolate("basis")
			.x(function(d) { return d.x; })
			.y(function(d) { return d.y; });

		lineGroup.append("path")
			.attr("d", lineFunction)
			.attr("stroke", "#666666")
			.attr("stroke-width", 1)
			.attr("fill", "none");

		// fade in the labels when the load effect is complete - or immediately if there's no load effect
		var loadSpeed = (_options.effects.load.effect === "default") ? _options.effects.load.speed : 1;
		setTimeout(function() {
			var labelFadeInTime = (_options.effects.load.effect === "default") ? _options.effects.labelFadeInTime : 1;
			d3.selectAll("g.lineGroups")
				.transition()
				.duration(labelFadeInTime)
				.style("opacity", 1);
		}, loadSpeed);
	};

	var _addSegmentEventHandlers = function() {
		$(".arc").on("click", function(e) {
			var $segment = $(e.currentTarget).find("path");
			var isExpanded = $segment.attr("class") === "expanded";

			_onSegmentEvent(_options.callbacks.onClickSegment, $segment, isExpanded);

			if (_options.effects.pullOutSegmentOnClick.effect !== "none") {
				if (isExpanded) {
					_closeSegment($segment[0]);
				} else {
					_openSegment($segment[0]);
				}
			}
		});

		$(".arc").on("mouseover", function(e) {
			var $segment = $(e.currentTarget).find("path");
			var isExpanded = $segment.attr("class") === "expanded";
			_onSegmentEvent(_options.callbacks.onMouseoverSegment, $segment, isExpanded);
		});

		$(".arc").on("mouseout", function(e) {
			var $segment = $(e.currentTarget).find("path");
			var isExpanded = $segment.attr("class") === "expanded";
			_onSegmentEvent(_options.callbacks.onMouseoutSegment, $segment, isExpanded);
		});
	};

	// helper function used to call the click, mouseover, mouseout segment callback functions
	var _onSegmentEvent = function(func, $segment, isExpanded) {
		if (!$.isFunction(func)) {
			return;
		}
		try {
			var index = parseInt($segment.data("index"), 10);
			func({
				segment: $segment[0],
				index: index,
				expanded: isExpanded,
				data: _options.data[index]
			});
		} catch(e) { }
	};


	var _getPieTranslateCenter = function() {
		var pieCenter = _getPieCenter();
		return "translate(" + pieCenter.x + "," + pieCenter.y + ")"
	};

	/**
	 * Used to determine where on the canvas the center of the pie chart should be. It takes into account the
	 * height and position of the title, subtitle and footer, and the various paddings.
	 * @private
	 */
	var _getPieCenter = function() {
		var hasTopTitle    = (_hasTitle && _options.header.location !== "pie-center");
		var hasTopSubtitle = (_hasSubtitle && _options.header.location !== "pie-center");

		var headerOffset = _options.misc.canvasPadding.top;
		if (hasTopTitle && hasTopSubtitle) {
			headerOffset = parseInt(d3.select(document.getElementById("subtitle")).attr("y"), 10) + _options.misc.titleSubtitlePadding;
		} else if (hasTopTitle) {
			headerOffset = parseInt(d3.select(document.getElementById("title")).attr("y"), 10);
		} else if (hasTopSubtitle) {
			headerOffset = parseInt(d3.select(document.getElementById("subtitle")).attr("y"), 10);
		}

		var footerOffset = 0;
		if (_hasFooter) {
			footerOffset = _getFooterHeight() + _options.misc.canvasPadding.bottom;
		}

		return {
			x: ((_options.size.canvasWidth - _options.misc.canvasPadding.right) / 2) + _options.misc.canvasPadding.left,
			y: ((_options.size.canvasHeight - footerOffset) / 2) + headerOffset
		}
	};


	var _addFilter = function() {
		//console.log(_getPieCenter());
		//_svg.append('<filter id="testBlur"><feDiffuseLighting in="SourceGraphic" result="light" lighting-color="white"><fePointLight x="150" y="60" z="20" /></feDiffuseLighting><feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/></filter>')
	};


	// can only be called after the footer has been added to the SVG document
/*	var _getFooterHeight = function() {
		var dimensions = document.getElementById("footer").getBBox();
		return dimensions.height;
	};

	var _getTitleHeight = function() {
		var dimensions = document.getElementById("title").getBBox();
		return dimensions.height;
	};

	var _getSubtitleHeight = function() {
		var dimensions = document.getElementById("subtitle").getBBox();
		return dimensions.height;
	};
	*/

})(jQuery, window, document);