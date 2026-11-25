from flask import Flask

def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static",
                subdomain_matching=True)
    app.secret_key = "palitan-ito-ng-mahabang-random-string"
    app.config["SERVER_NAME"] = "localhost:5000"     # base address ng buong website

    from .blueprints.admin_side import admin
    from .blueprints.partner_side import partner
    from .blueprints.user_side import user

    app.register_blueprint(admin)
    app.register_blueprint(partner)
    app.register_blueprint(user)
    return app