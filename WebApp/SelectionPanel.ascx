﻿<%-- 
  Copyright 2012 Applied Geographics, Inc.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
--%>

<%@ Control Language="C#" AutoEventWireup="true" CodeFile="SelectionPanel.ascx.cs" Inherits="SelectionPanel" %>
<%@ Register TagPrefix="gpv" Assembly="App_Code" Namespace="GPV" %>

<div class="FunctionHeader"><span class="glyphicon glyphicon-menu-left FunctionExit" aria-hidden="true"></span>Selection</div>

  <div id="pnlQuery" class="Panel">
    <div id="pnlSelectionOptions" class="Panel">
      <gpv:Select ID="ddlAction" runat="server" CssClass="Input" ToolTip="Action to perform with the Select Features tool to the left" />
      <gpv:Select ID="ddlTargetLayer" runat="server" CssClass="Input" ToolTip="Target layer containing features of interest" />
      <gpv:Select ID="ddlProximity" runat="server" CssClass="Input" ToolTip="Proximity of target features to selection features" />
      <gpv:Select ID="ddlSelectionLayer" runat="server" CssClass="Input" ToolTip="Selection layer with features that will help find target features" />
      <gpv:Select ID="ddlQuery" runat="server" CssClass="Input" ToolTip="Filter which lists only those features meeting certain criteria" />
    </div>
    <div id="pnlSelectTools" class="Panel">
      <button id="cmdSelectView" title="Select All in View"><span class="select-view"></span>Select All</button>
      <button id="cmdZoomSelect" title="Zoom to Selected Features"><span class="select-zoom"></span>Zoom To</button>
      <button id="cmdClearSelection" title="Clear Selection"><span class="select-clear"></span>Clear</button>
    </div>
    <div id="pnlQueryGrid" class="Panel">
      <table id="grdQuery" class="DataGrid"></table>
    </div>
    <div id="pnlQueryCommand" class="Panel">
      <div id="labSelectionCount">None selected</div>
      <button id="cmdMailingLabels" class="Disabled" title="Mailing Labels"><i class="fa fa-tag"></i> Mailing Labels</button>
      <button id="cmdExportData" class="Disabled" title="Spreadsheet"><i class="fa fa-table"></i> Spreadsheet</button>
    </div>
  </div>

<div id="selectionDivider"></div>
<form id="frmExportData" method="post" target="export">
  <input id="hdnExportLayer" type="hidden" name="layer" />
  <input id="hdnExportIds" type="hidden" name="ids" />
</form>