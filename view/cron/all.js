var psr = require('parse-service-request');
var checkRoleAccess = require('../../lib/server/routeHandlers/checkRoleAccess');
var config = require('../../config');
var mschema = require('mschema');
var cron = require('../../lib/resources/cron/cron');
var metric = require('../../lib/resources/metric');

var html = require('../helpers/html');
var fnst = require('date-fns-timezone');

module['exports'] = function allCronPresenter (opts, cb) {

  var $ = this.$, 
    req = opts.request,
    res = opts.response,
    params = req.resource.params;

  $ = req.white($);

  var self = this;

  psr(req, res, function (req, res, fields) {
    for (var p in fields) {
      params[p] = fields[p];
    }
    finish();
  });

  function finish () {
    checkRoleAccess({ req: req, res: res, role: 'cron::read' }, function (err, hasPermission) {
      if (!hasPermission) {
        return res.end(config.messages.unauthorizedRoleAccess(req, 'cron::read'));
      } else {
        var validate = mschema.validate(req.resource.params, self.schema);
        if (!validate.valid) {
          validate.status = 'error';
          return res.json(validate);
        } else {
          return cron.find({ owner: req.resource.owner }, function (err, results) {
            if (err) {
              return res.end(err.message);
            }
            if (results.length === 0) {
              $('.crons').remove();
            } else {
              $('.nocrons').remove();
            }
            var keys = [], metricKeys = [];
            results.forEach(function (key){
              keys.push('/' + key.owner + '/' + key.name);
              metricKeys.push('/cron/' + key.owner + '/' + key.name);
            });

            metric.batchGet(metricKeys, function (err, metrics) {
              cron.batchGet(keys, function (err, crons) {
                var arr = [];
                results.forEach(function(r, i){
                  if (r) {
                    var cached = crons['/' + r.owner + '/' + r.name] || {
                      lastExecutionDate: 'n/a',
                      nextExecutionDate: 'n/a'
                    };
                    var hits = metrics['/cron/' + r.owner + '/' + r.name] || "0";
                    var timezone = req.session.timezone || 'America/New_York';
                    var lastExecutionDate = 'n/a';
                    var nextExecutionDate = 'n/a';

                    if (cached.lastExecutionDate) {
                      lastExecutionDate = fnst.formatToTimeZone(cached.lastExecutionDate, 'MMMM DD, YYYY HH:mm:ss z', { timeZone: timezone });
                    }
                    if (cached.nextExecutionDate) {
                      nextExecutionDate = fnst.formatToTimeZone(cached.nextExecutionDate, 'MMMM DD, YYYY HH:mm:ss z', { timeZone: timezone });
                    }
                    if (lastExecutionDate === 'Invalid Date') {
                      lastExecutionDate = 'n/a';
                    }
                    if (nextExecutionDate === 'Invalid Date') {
                      nextExecutionDate = 'n/a';
                    }
                    arr.push({
                      name: r.name,
                      owner: r.owner,
                      cronExpression: r.cronExpression,
                      hits: hits,
                      lastExecutionDate: lastExecutionDate,
                      nextExecutionDate: nextExecutionDate,
                      status: r.status
                    })
                    $('.crons').append(html.rowToString([
                      html.makeLink(config.app.url + '/cron/' + r.owner + '/' + r.name, r.name),
                      r.cronExpression,
                      hits,
                      lastExecutionDate,
                      nextExecutionDate,
                      r.status,
                      html.makeLink(config.app.url + '/cron/' + r.owner + '/' + r.name + '/admin', 'Edit'),
                    ]));
                  }
                });
                if (req.jsonResponse) {
                  return res.json(arr);
                }
                return cb(null, $.html());
              });
            });
          });
        }
      }
    });
  }
};
