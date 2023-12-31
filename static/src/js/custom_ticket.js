odoo.define("marcos_custom_restaurant_ticket.ticket_changes", function (require) {
  "use strict";

  var models = require("point_of_sale.models");
  var core = require('web.core');
  var Printer = require("pos_restaurant.multiprint").Printer;
  var QWeb = core.qweb;

  var _super_posmodel = models.Order.prototype;

  models.Order = models.Order.extend({
    initialize: function (session, attributes) {
      var self = this;

      // call original method via "apply"
      _super_posmodel.initialize.apply(this, arguments);
    },
    build_line_resume: function () {
      var resume = {};
      this.orderlines.each(function (line) {
        if (line.mp_skip) {
          return;
        }
        var line_hash = line.get_line_diff_hash();
        var qty = Number(line.get_quantity());
        var note = line.get_note();
        var product_id = line.get_product().id;
        var product_cat = line.get_product().pos_categ_id[1];

        if (typeof resume[line_hash] === 'undefined') {
          resume[line_hash] = {
            qty: qty,
            note: note,
            product_id: product_id,
            product_cat: product_cat,
            product_name_wrapped: line.generate_wrapped_product_name(),
          };
        } else {
          resume[line_hash].qty += qty;
        }

      });
      return resume;
    },
    computeChanges: function (categories) {
      var current_res = this.build_line_resume();
      var old_res = this.saved_resume || {};
      var json = this.export_as_JSON();
      var add = [];
      var rem = [];
      var line_hash;

      for (line_hash in current_res) {
        var curr = current_res[line_hash];
        var old = old_res[line_hash];

        if (typeof old === 'undefined') {
          add.push({
            'id': curr.product_id,
            'name': this.pos.db.get_product_by_id(curr.product_id).display_name,
            'category': curr.product_cat,
            'name_wrapped': curr.product_name_wrapped,
            'note': curr.note,
            'qty': curr.qty,
          });
        } else if (old.qty < curr.qty) {
          add.push({
            'id': curr.product_id,
            'name': this.pos.db.get_product_by_id(curr.product_id).display_name,
            'category': curr.product_cat,
            'name_wrapped': curr.product_name_wrapped,
            'note': curr.note,
            'qty': curr.qty - old.qty,
          });
        } else if (old.qty > curr.qty) {
          rem.push({
            'id': curr.product_id,
            'name': this.pos.db.get_product_by_id(curr.product_id).display_name,
            'category': curr.product_cat,
            'name_wrapped': curr.product_name_wrapped,
            'note': curr.note,
            'qty': old.qty - curr.qty,
          });
        }
      }

      for (line_hash in old_res) {
        if (typeof current_res[line_hash] === 'undefined') {
          var old = old_res[line_hash];
          rem.push({
            'id': old.product_id,
            'name': this.pos.db.get_product_by_id(old.product_id).display_name,
            'category': old.product_cat,
            'name_wrapped': old.product_name_wrapped,
            'note': old.note,
            'qty': old.qty,
          });
        }
      }

      if (categories && categories.length > 0) {
        // filter the added and removed orders to only contains
        // products that belong to one of the categories supplied as a parameter

        var self = this;

        var _add = [];
        var _rem = [];

        for (var i = 0; i < add.length; i++) {
          if (self.pos.db.is_product_in_category(categories, add[i].id)) {
            _add.push(add[i]);
          }
        }
        add = _add;

        for (var i = 0; i < rem.length; i++) {
          if (self.pos.db.is_product_in_category(categories, rem[i].id)) {
            _rem.push(rem[i]);
          }
        }
        rem = _rem;
      }

      var d = new Date();
      var hours = '' + d.getHours();
      hours = hours.length < 2 ? ('0' + hours) : hours;
      var minutes = '' + d.getMinutes();
      minutes = minutes.length < 2 ? ('0' + minutes) : minutes;

      return {
        'new': add,
        'cancelled': rem,
        'table': json.table || false,
        'floor': json.floor || false,
        'name': json.name || 'unknown order',
        'time': {
          'hours': hours,
          'minutes': minutes,
        },
      };
    },
    printChanges: function () {
      var printers = this.pos.printers;
      for (var i = 0; i < printers.length; i++) {
        var changes = this.computeChanges(printers[i].config.product_categories_ids);
        if (_.size(changes['new']) > 0 || _.size(changes['cancelled']) > 0) {
          changes['new'] = _.groupBy(changes['new'], 'category');

          var receipt = QWeb.render('marcos_custom_restaurant_ticket.custom_order_change_ticket', { changes: changes, widget: this });
          printers[i].print(receipt);
        }
      }
    },
  });
});
