﻿//  Copyright 2016 Applied Geographics, Inc.
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.

var GPV = (function (gpv) {
  $(function () {
    var appState = gpv.appState;

    var fullExtent = L.Bounds.fromArray(gpv.configuration.fullExtent);
    var tileLayers = {};
    var resizeHandle;
    var redrawPost;

    var $mapOverview = $("#mapOverview");
    var $locatorBox = $("#locatorBox");
    var overviewMapHeight = null;
    var overviewMapWidth = null;
    var locatorPanning = false;
    var overviewExtent;

    var mapTabChangedHandlers = [];
    var functionTabChangedHandlers = [];
    var extentChangedHandlers = [];
    var mapRefreshedHandlers = [];

    var panelAnimationTime = 400;

    // =====  controls required prior to map control creation  =====

    var $pnlDataDisplay = $("#pnlDataDisplay");

    // =====  map control  =====

    var maxZoom = gpv.settings.zoomLevels - 1;
    var crs = L.CRS.EPSG3857;

    if (gpv.settings.mapCrs) {
      crs = new L.Proj.CRS("GPV:1", gpv.settings.mapCrs);
      var c = crs.unproject(fullExtent.getCenter());
      var sf = 2 / L.CRS.EPSG3857.scaleFactorAtLatitude(c.lat);

      var isFeet = gpv.settings.mapCrs.indexOf("+to_meter=0.3048") >= 0;
      var resolutions = [ (isFeet ? 513591 : 156543) * sf ];

      for (var i = 0; i < maxZoom; ++i) {
        resolutions.push(resolutions[i] * 0.5);
      }

      crs = new L.Proj.CRS("GPV:1", gpv.settings.mapCrs, {
        resolutions: resolutions
      });
    }

    var map = L.map("mapMain", {
      crs: crs,
      maxZoom: maxZoom,
      drawing: {
        mode: 'off',
        style: {
          color: '#808080',
          weight: 2,
          opacity: 1,
          fill: true,
          fillColor: '#808080',
          fillOpacity: 0.5
        },
        text: {
          className: 'MarkupText',
          color: '#FF0000'
        }
      }
    });

    map.on("click", identify);

    var shingleLayer = L.shingleLayer({ 
      urlBuilder: refreshMap, 
      zIndex: 100, 
      preserveOnPan: false          // TO DO: reset based on presence of underlay tiles
    }).on("shingleload", function () {
      gpv.progress.clear();
      updateOverviewExtent();

      $.each(mapRefreshedHandlers, function () {
        this();
      });
    }).addTo(map);

    if (gpv.settings.showScaleBar) {
      L.control.scale({
        imperial: gpv.settings.measureUnits !== "meters",
        metric: gpv.settings.measureUnits !== "feet"
      }).addTo(map);
    }

    var fullViewTool = L.Control.extend({
      options: {
        position: 'topleft'
      },
      onAdd: function ($map) {
        var button = L.DomUtil.create('div', 'mapButton');
        $(button).attr('id', 'cmdFullView');
        $(button).attr('title', 'Full Extent');
        $(button).html('<span class="glyphicon glyphicon-globe"></span>');
        return button;
      }
    });

    var locationTool = L.Control.extend({
      options: {
        position: 'topleft'
      },
      onAdd: function ($map) {
        var button = L.DomUtil.create('div', 'mapButton');
        $(button).attr('id', 'cmdLocation');
        $(button).attr('title', 'Current Location');
        $(button).html('<span class="glyphicon glyphicon-screenshot"></span>');
        return button;
      }
    });

    map.addControl(new fullViewTool())
       .addControl(new locationTool());

    gpv.mapTip.setMap(map);
    gpv.selectionPanel.setMap(map);
    gpv.markupPanel.setMap(map);
    gpv.sharePanel.setMap(map);

    // =====  control events  =====
    
    $(window).on("resize", function () {
      if (resizeHandle) {
        clearTimeout(resizeHandle);
      }

      resizeHandle = setTimeout(function () {
        resizeHandle = undefined;
        shingleLayer.redraw();
      }, 250);
    });

    $("#cmdEmail").on("click", function () {
      gpv.post({
        url: "Services/SaveAppState.ashx",
        data: {
          state: gpv.appState.toJson()
        },
        success: function (result) {
          if (result && result.id) {
            var loc = document.location;
            var url = [loc.protocol, "//", loc.hostname, loc.port.length && loc.port != "80" ? ":" + loc.port : "", loc.pathname, "?state=", result.id].join("");
            $lnkEmail.val(url);
            $('#pnlEmail').fadeIn(600);
            selectEmailLink();
          }
        }
      });
    });

    $('#cmdEmailClose').on('click', function(e){
      e.preventDefault();
      $('#pnlEmail').fadeOut(600);
    });

    var $lnkEmail = $("#lnkEmail").on("mousedown", function (e) {
      if (e.which > 1) {
        e.preventDefault();
        selectEmailLink();
      }
    });

    function selectEmailLink() {
      $lnkEmail.prop("selectionStart", 0).prop("selectionEnd", $lnkEmail.val().length);
    }

    $("#cmdFullView").on("click", function () {
      zoomToFullExtent();
    });

    $("#cmdLocation").on("click", function () {
      if (navigator && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (pos) {
          var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
          map.setView(latlng, maxZoom - 2);
        }, showGpsError);
      }
      else {
        showGpsError();
      }
    }).popover({
      content: 'GPS is not enabled on this device',
      delay: { show: 500, hide: 500 },
      placement: 'right',
      trigger: 'manual'
    });

    $("#cmdMenu").on("click", function () {
      var hide = $("#pnlFunctionSidebar").css("left") === "0px";
      $("#pnlFunctionSidebar").animate({ left: hide ? "-400px" : "0px" }, { duration: 800 });
      $("#pnlMapSizer").animate({ left: hide ? "0px" : "400px" }, { 
          duration: 800,
          progress: function () {
            map.invalidateSize();
          },
          complete: function () {
            map.invalidateSize();
            shingleLayer.redraw();
          }
      });
    });

    $("#cmdShowDetails").on("click", function () {
      if ($pnlDataDisplay.css("right").substring(0, 1) === "-") {
        $pnlDataDisplay.show();
        $pnlDataDisplay.animate({ right: 0, opacity: "1.0" }, 600, function () {
          $(".DataExit").addClass("DataExitOpen");
        });
        $("#pnlOverview").animate({ right: 295 }, 600);
        $("div.leaflet-control-attribution.leaflet-control").animate({ right: 346 }, 600);
      }
      else {
        $(".DataHeader").trigger("click");
      }
    });

    $("#cmdZoomSelect").on("click", function () {
      zoomToSelection(1.2);
    });

    $(".DataHeader").on("click", function () {
      var width = "-" + $pnlDataDisplay.css("width");
      $pnlDataDisplay.animate({ right: width, opacity: "0" }, 600, function () {
        $(".DataExit").removeClass("DataExitOpen");
        $pnlDataDisplay.hide();
      });
      $("#pnlOverview").animate({ right: 5 }, 600);
      $("div.leaflet-control-attribution.leaflet-control").animate({right: 35}, 600);
    });

    $(".FunctionHeader").on("click", function () {
      hideFunctionPanel(showFunctionMenu);
    });

    $("#cmdOverview").on("click", function () {
      if ($("#mapOverview").css("background-image") === "none") {
        $("#pnlOverview").removeClass("overviewInitial").addClass("overviewMap");
        $("#iconOverview").addClass('iconOpen');
        overviewMapHeight = $("#pnlOverview").height();
        overviewMapWidth = $("#pnlOverview").width();
        $("div.leaflet-control-attribution.leaflet-control").css({ right: overviewMapWidth + 10 });
        $mapOverview = $("#mapOverview");
        overviewExtent = fullExtent.fit($mapOverview.width(), $mapOverview.height());
        setOverviewMap();
        updateOverviewExtent();
      }
      else {
        if ($("#iconOverview").hasClass("iconOpen")) {
          $("#pnlOverview").animate({ height: "26px", width: "26px" }, 600, function () {
            $("#iconOverview").removeClass('iconOpen');
          });
          $("div.leaflet-control-attribution.leaflet-control").animate({ right: 35 }, 600);
        }
        else {
          $("#pnlOverview").animate({ height: overviewMapHeight + "px", width: overviewMapWidth + "px" }, 600, function () {
            $("#iconOverview").addClass('iconOpen');
            updateOverviewExtent();
          });
          $("div.leaflet-control-attribution.leaflet-control").animate({ right: overviewMapWidth + 10 }, 600);
        }
      }
    });

    $(".MenuItem").on("click", function(){
      var name = $(this).text();
      
      hideFunctionMenu(function () { showFunctionPanel(name); });

      $.each(functionTabChangedHandlers, function () {
        this(name);
      });
    });

    $("#selectMapTheme li").click(function () {
      $("#selectedTheme").html($(this).html());
      var mapTab = $(this).attr("data-maptab");
      appState.update({ MapTab: mapTab });
      triggerMapTabChanged();
      shingleLayer.redraw();
      drawTileLayers();
    });

    $("#selectMapLevel li").click(function () {
      $("#selectedLevel").html($(this).html());
      appState.update({ Level: $(this).attr("data-level") });
      shingleLayer.redraw();
    });

    // =====  map tools  =====

    $("#selectMapTools li").not($(".dropdown-header")).click(function () {
      if (!$(this).hasClass('Disabled')) {
        $("#selectedTool").html($(this).html());
      }
    });

    var $MapTool = $(".MapTool");

    $("#optIdentify").on("click", function () {
      gpv.selectTool($(this), map, { cursor: 'default', drawing: { mode: 'off' } });
    });

    $("#optPan").on("click", function () {
      gpv.selectTool($(this), map, { cursor: '', drawing: { mode: 'off' } });
    });


    // =====  component events  =====

    gpv.on("selection", "changed", function (truncated, scaleBy) {
      if (scaleBy) {
        zoomToSelection(scaleBy);
      }
      else {
        shingleLayer.redraw();
      }
    });

    // =====  private functions  =====

    function createTileLayers() {
      Object.keys(gpv.configuration.mapTab).forEach(function (m) {
        tileLayers[m] = {};

        gpv.configuration.mapTab[m].tileGroup.forEach(function (tg) {
          var z = -1;

          tileLayers[m][tg.group.id] = tg.group.tileLayer.map(function (tl) {
            z += 1;

            return L.tileLayer(tl.url, { 
              zIndex: tl.overlay ? 200 + z : z, 
              attribution: tl.attribution,
              opacity: tg.opacity,
              maxZoom: tl.maxZoom || map.options.maxZoom
            });
          });
        });
      });
    }

    function drawTileLayers() {
      map.eachLayer(function (layer) {
        if (layer.constructor === L.TileLayer) {
          map.removeLayer(layer);
        }
      });

      var mapTab = appState.MapTab;
      var visible = gpv.legendPanel.getVisibleTiles(mapTab);

      Object.keys(tileLayers[mapTab]).forEach(function (tg) {
        if (visible.indexOf(tg) >= 0) {
          tileLayers[mapTab][tg].forEach(function (tl) {
            tl.addTo(map);
          });
        }
      });
    }

    function hideFunctionMenu(callback) {
      $("#pnlFunctionTabs").animate({ left: "-400px", opacity: "0" }, panelAnimationTime, callback);
    }

    function hideFunctionPanel(callback) {
      $("#pnlFunction").animate({ left: "-400px", opacity: "0" }, panelAnimationTime, callback);
    }

    function identify(e) {
      if ($MapTool.filter(".Selected").attr("id") === "optIdentify") {
        var visibleLayers = gpv.legendPanel.getVisibleLayers(appState.MapTab);

        if (visibleLayers.length) {
          var p = map.options.crs.project(e.latlng);

          $.ajax({
            url: "Services/MapIdentify.ashx",
            data: {
              maptab: appState.MapTab,
              visiblelayers: visibleLayers.join("\x01"),
              level: appState.Level,
              x: p.x,
              y: p.y,
              distance: gpv.searchDistance(),
              scale: map.getProjectedPixelSize()
            },
            type: "POST",
            dataType: "html",
            success: function (html) {
              if (html.length > 28) {
                $("#pnlDataList").empty().append(html);
                $("#cmdDataPrint").removeClass("Disabled").data("printdata", [
                  "maptab=", encodeURIComponent(appState.MapTab),
                  "&visiblelayers=", encodeURIComponent(visibleLayers.join("\x01")),
                  "&level=", appState.Level,
                  "&x=", p.x,
                  "&y=", p.y,
                  "&distance=", gpv.searchDistance(),
                  "&scale=", map.getProjectedPixelSize(),
                  "&print=1"
                ].join(""));
              }
              else {
                $("#pnlDataList").empty().append('<div class="DataList">' +
                '<p style="text-align: center; margin-top: 10px; color: #898989;">' +
                'No Results</p></div>');
              }

              var $pnlDataDisplay = $("#pnlDataDisplay");

              $pnlDataDisplay.show();
              $pnlDataDisplay.find("#spnDataTheme").text("Identify");
              $pnlDataDisplay.find("#ddlDataTheme").hide();

              if ($pnlDataDisplay.css("right").substring(0, 1) === "-") {
                $pnlDataDisplay.animate({ right: 0, opacity: "1.0" }, 600, function () {
                  $(".DataExit").addClass("DataExitOpen");
                });
                $("#pnlOverview").animate({ right: 295 }, 600);
              }
            },
            error: function (xhr, status, message) {
              alert(message);
            }
          });
        }
      }
    }

    function refreshMap(size, bbox, callback) {
      var extent = appState.Extent;
      var same = sameBox(extent.bbox, bbox);
      extent.bbox = bbox;

      var layers = appState.VisibleLayers;
      layers[appState.MapTab] = gpv.legendPanel.getVisibleLayers(appState.MapTab);

      appState.update({
        Extent: extent,
        VisibleLayers: layers
      });

      if (!same) {
        $.each(extentChangedHandlers, function () {
          this(bbox);
        });
      }

      if (redrawPost && redrawPost.readyState !== 4) {
        redrawPost.abort();
      }

      gpv.progress.start();

      redrawPost = gpv.post({
        url: "Services/MapImage.ashx",
        data: {
          m: "MakeMapImage",
          state: appState.toJson(),
          width: size.x,
          height: size.y
        }
      }).done(function (url) {
        redrawPost = null;
        callback(url);
      });
    }

    function sameBox(a, b) {
      return a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3];
    }

    function setExtent(extent) {
      showLevel();
      map.fitProjectedBounds(L.Bounds.fromArray(extent));
      return map.getProjectedBounds().toArray();
    }

    function showFunctionMenu() {
      $("#pnlFunctionTabs").animate({ left: "12px", opacity: "1.0" }, panelAnimationTime);
      $(".share").hide();
      $(".FunctionExit").removeClass("FunctionExitOpen");
    }

    function showFunctionPanel(name) {
      $(".FunctionPanel").hide();
      $("#pnl" + name).show();
      $("#pnlFunction").animate({ left: "0px", opacity: "1.0" }, panelAnimationTime, function () {
        $(".FunctionExit").addClass("FunctionExitOpen");
      });
    }

    function showLevel() {
      var $li = $("#selectMapLevel li[data-level=\"" + appState.Level + "\"]");
      $("#selectedLevel").html($li.html());
    }

    function switchToPanel(name) {
      if (parseInt($("#pnlFunctionTabs").css("left"), 10) >= 0) {
        hideFunctionMenu(function () { showFunctionPanel(name); });
      }
      else {
        hideFunctionPanel(function () { showFunctionPanel(name); });
      }
    }

    function toggleTileGroup(groupId, visible) {
      tileLayers[appState.MapTab][groupId].forEach(function (tl) {
        if (visible) {
          tl.addTo(map);
        }
        else {
          map.removeLayer(tl);
        }
      });
    }

    function triggerMapTabChanged() {
      $.each(mapTabChangedHandlers, function () {
        this();
      });
    }

    function zoomToActive() {
      gpv.selection.getActiveExtent(function (bbox) {
        if (bbox) {
          map.fitProjectedBounds(L.Bounds.fromArray(bbox).pad(1.2));
        }
      });
    }

    function zoomToFullExtent() {
      map.fitProjectedBounds(fullExtent);
    }

    function zoomToSelection(scaleBy) {
      gpv.selection.getSelectionExtent(function (bbox) {
        if (bbox) {
          map.fitProjectedBounds(L.Bounds.fromArray(bbox).pad(scaleBy));
        }
      });
    }

    // =====  overvew map  =====

    $("#locatorBox,#locatorBoxFill").mousedown(function (e) {
      e.preventDefault();
    });

    $mapOverview.mousedown(function (e) {
      locatorPanning = true;
      panLocatorBox(e);
    });

    $mapOverview.mousemove(function (e) {
      if (locatorPanning) {
        panLocatorBox(e);
      }
    });

    $mapOverview.mouseup(function (e) {
      if (locatorPanning) {
        panLocatorBox(e);
        locatorPanning = false;

        var x = e.pageX - $mapOverview.offset().left;
        var y = e.pageY - $mapOverview.offset().top;

        x = (x * overviewExtent.getSize().x / $mapOverview.width()) + overviewExtent.min.x;
        y = overviewExtent.max.y - (y * overviewExtent.getSize().y / $mapOverview.height());

        map.panTo(map.options.crs.unproject(L.point(x, y)));
      }
    });

    $mapOverview.mouseleave(function () {
      locatorPanning = false;
    });

    function setOverviewMap() {
      var url = "Services/MapImage.ashx?" + $.param({
        m: "GetOverviewImage",
        application: appState.Application,
        width: $mapOverview.width(),
        height: $mapOverview.height(),
        bbox: overviewExtent.toArray().join()
      });

      $mapOverview.css("backgroundImage", "url(" + url + ")");
    }

    function panLocatorBox(e) {
      var x = e.pageX - $mapOverview.offset().left;
      var y = e.pageY - $mapOverview.offset().top;
      var left = Math.round(x - $locatorBox.width() * 0.5) - 2;
      var top = Math.round(y - $locatorBox.height() * 0.5) - 2;
      $locatorBox.css({ left: left + "px", top: top + "px" });
    }

    function updateOverviewExtent() {
      if (!$("#iconOverview").hasClass('iconOpen') || locatorPanning) {
        return;
      }

      function toScreenX(x) {
        return Math.round($mapOverview.width() * (x - overviewExtent.min.x) / overviewExtent.getSize().x);
      }

      function toScreenY(y) {
        return Math.round($mapOverview.height() * (overviewExtent.max.y - y) / overviewExtent.getSize().y);
      }

      var extent = map.getProjectedBounds();

      var left = toScreenX(extent.min.x);
      var top = toScreenY(extent.max.y);
      var right = toScreenX(extent.max.x);
      var bottom = toScreenY(extent.min.y);
      var width = $mapOverview.width();
      var height = $mapOverview.height();

      $locatorBox.css({ left: left - 2 + "px", top: top - 2 + "px", width: right - left + "px", height: bottom - top + "px" });
    }

    function showGpsError() {
      $("#cmdLocation").popover('show');

      setTimeout(function () {
        $("#cmdLocation").popover('hide');
      }, 2000);
    }

    // =====  public interface  =====

    gpv.viewer = {
      extentChanged: function (fn) { extentChangedHandlers.push(fn); },
      mapRefreshed: function (fn) { mapRefreshedHandlers.push(fn); },
      getExtent: function () { return map.getProjectedBounds().toArray(); },
      functionTabChanged: function (fn) { functionTabChangedHandlers.push(fn); },
      mapTabChanged: function (fn) { mapTabChangedHandlers.push(fn); },
      refreshMap: function () { showLevel(); shingleLayer.redraw(); },
      setExtent: setExtent,
      switchToPanel: switchToPanel,
      toggleTileGroup: toggleTileGroup,
      zoomToActive: zoomToActive
    };

    // =====  finish initialization  =====

    map.fitProjectedBounds(L.Bounds.fromArray(appState.Extent.bbox));

    //need to add title attribute due to bootstrap overwriting title with popover
    $("#cmdLocation").attr("title", "Current Location");

    gpv.loadComplete();
    createTileLayers();
    drawTileLayers();
    $MapTool.filter(".Selected").trigger("click");
    triggerMapTabChanged();
  });

  return gpv;
})(GPV || {});